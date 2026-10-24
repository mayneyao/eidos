//! Host-owned BLE grants, serialized GATT operations, and connection lifetime.
use anyhow::{anyhow, bail, ensure, Context, Result};
use btleplug::{
    api::{
        Central, CentralState, CharPropFlags, Characteristic, Manager as _, Peripheral as _,
        ScanFilter, WriteType,
    },
    platform::{Adapter, Manager, Peripheral},
};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    io::Read,
    path::Path,
    sync::mpsc::SyncSender,
    time::Duration,
};
use tokio::{
    runtime::Runtime,
    sync::{mpsc, oneshot},
    task::JoinHandle,
    time::timeout,
};
use uuid::Uuid;

const OP_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_VALUE: usize = 512;

pub fn uuid(value: &str) -> Result<Uuid> {
    let short = match value {
        "battery_service" => Some(0x180f),
        "battery_level" => Some(0x2a19),
        "heart_rate" => Some(0x180d),
        "heart_rate_measurement" => Some(0x2a37),
        "device_information" => Some(0x180a),
        "manufacturer_name_string" => Some(0x2a29),
        _ => None,
    };
    if let Some(short) = short {
        return Ok(Uuid::from_u128(
            ((short as u128) << 96) | 0x00001000800000805f9b34fb,
        ));
    }
    Uuid::parse_str(value).context("Expected a canonical UUID or supported Bluetooth alias")
}

#[derive(Clone, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Policy {
    #[serde(default)]
    devices: Vec<DeviceGrant>,
}
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct DeviceGrant {
    id: String,
    name: Option<String>,
    #[serde(default, rename = "allServices")]
    all_services: bool,
    services: Vec<ServiceGrant>,
}
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct ServiceGrant {
    uuid: String,
    #[serde(default)]
    read: bool,
    #[serde(default)]
    write: bool,
    #[serde(default)]
    notify: bool,
}
impl Policy {
    pub fn load(path: Option<&Path>) -> Result<Self> {
        let Some(path) = path else {
            return Ok(Self::default());
        };
        let mut bytes = Vec::new();
        std::fs::File::open(path)?
            .take(65537)
            .read_to_end(&mut bytes)?;
        ensure!(bytes.len() <= 65536, "Bluetooth policy exceeds 64 KiB");
        let mut policy: Self = serde_json::from_slice(&bytes).context("Bluetooth policy")?;
        ensure!(
            policy.devices.len() <= 16,
            "At most 16 Bluetooth device grants"
        );
        let mut ids = HashSet::new();
        for device in &mut policy.devices {
            ensure!(
                !device.id.is_empty() && device.id.len() <= 128 && ids.insert(device.id.clone()),
                "Invalid/duplicate Bluetooth device ID"
            );
            ensure!(
                device.services.len() <= 32,
                "At most 32 services per device"
            );
            ensure!(
                device.name.as_ref().is_none_or(|s| s.len() <= 256),
                "Bluetooth display name too long"
            );
            let mut services = HashSet::new();
            for service in &mut device.services {
                service.uuid = uuid(&service.uuid)?.to_string();
                ensure!(
                    services.insert(service.uuid.clone()),
                    "Duplicate service grant"
                );
            }
        }
        Ok(policy)
    }
    fn device(&self, id: &str) -> Result<&DeviceGrant> {
        self.devices
            .iter()
            .find(|d| d.id == id)
            .ok_or_else(|| anyhow!("SecurityError: Bluetooth device is not granted"))
    }
    fn service(&self, id: &str, service: &str) -> Result<ServiceGrant> {
        let device = self.device(id)?;
        if device.all_services {
            return Ok(ServiceGrant {
                uuid: service.to_owned(),
                read: true,
                write: true,
                notify: true,
            });
        }
        device
            .services
            .iter()
            .find(|s| s.uuid == service)
            .cloned()
            .ok_or_else(|| anyhow!("SecurityError: Bluetooth service is not granted"))
    }
}

#[derive(Clone)]
struct Events {
    tx: mpsc::Sender<Value>,
    wake: SyncSender<()>,
}
impl Events {
    async fn send(&self, event: Value) {
        if self.tx.send(event).await.is_ok() {
            let _ = self.wake.try_send(());
        }
    }
}
struct Command {
    id: u64,
    method: String,
    data: Value,
}

pub struct Bluetooth {
    runtime: Option<Runtime>,
    commands: mpsc::Sender<Command>,
    stop: Option<oneshot::Sender<()>>,
    task: Option<JoinHandle<()>>,
    events: mpsc::Receiver<Value>,
    pending: HashSet<u64>,
    connected: HashSet<String>,
    next: u64,
}
impl Bluetooth {
    pub fn new(policy: Policy, mock: bool, wake: SyncSender<()>) -> Result<Self> {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .enable_all()
            .build()?;
        let (commands, receiver) = mpsc::channel(16);
        let (tx, events) = mpsc::channel(32);
        let (stop, stopped) = oneshot::channel();
        let task = runtime.spawn(actor(policy, mock, receiver, stopped, Events { tx, wake }));
        Ok(Self {
            runtime: Some(runtime),
            commands,
            stop: Some(stop),
            task: Some(task),
            events,
            pending: HashSet::new(),
            connected: HashSet::new(),
            next: 1,
        })
    }
    pub fn call(&mut self, method: String, input: String) -> String {
        let result = (|| -> Result<Value> {
            ensure!(
                self.stop.is_some(),
                "InvalidStateError: Bluetooth host stopped"
            );
            ensure!(
                input.len() <= 8192,
                "QuotaExceededError: Bluetooth command exceeds 8 KiB"
            );
            ensure!(
                self.pending.len() < 16,
                "QuotaExceededError: Too many Bluetooth operations"
            );
            let data: Value = serde_json::from_str(&input)?;
            if method == "uuid" {
                return Ok(json!(uuid(
                    data.as_str()
                        .ok_or_else(|| anyhow!("Expected UUID string"))?
                )?
                .to_string()));
            }
            let id = self.next;
            ensure!(id < 9_007_199_254_740_991, "Resource ID limit reached");
            self.commands
                .try_send(Command { id, method, data })
                .map_err(|_| anyhow!("QuotaExceededError: Bluetooth queue full/closed"))?;
            self.next += 1;
            self.pending.insert(id);
            Ok(json!(id))
        })();
        match result {
            Ok(value) => json!({"ok":true,"value":value}).to_string(),
            Err(error) => json!({"ok":false,"error":format!("{error:#}")}).to_string(),
        }
    }
    pub fn pending(&self) -> bool {
        !self.pending.is_empty() || !self.connected.is_empty()
    }
    pub fn poll(&mut self) -> Option<Value> {
        let event = self.events.try_recv().ok()?;
        match event["type"].as_str() {
            Some("result") => {
                self.pending.remove(&event["id"].as_u64()?);
            }
            Some("connected") => {
                self.connected.insert(event["device"].as_str()?.into());
            }
            Some("disconnected") => {
                self.connected.remove(event["device"].as_str()?);
            }
            _ => {}
        }
        Some(event)
    }
    pub fn stop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        self.events.close();
        self.pending.clear();
        self.connected.clear();
    }
}
impl Drop for Bluetooth {
    fn drop(&mut self) {
        self.stop();
        if let Some(runtime) = self.runtime.take() {
            if let Some(mut task) = self.task.take() {
                runtime.block_on(async {
                    if timeout(Duration::from_secs(3), &mut task).await.is_err() {
                        task.abort();
                    }
                });
            }
            runtime.shutdown_timeout(Duration::from_secs(1));
        }
    }
}

struct Connection {
    peripheral: Option<Peripheral>,
    epoch: u64,
    connected: bool,
    characteristics: Vec<Characteristic>,
    subscriptions: HashSet<(Uuid, Uuid)>,
    notifications: Option<JoinHandle<()>>,
    value: Vec<u8>,
}
struct Session {
    policy: Policy,
    mock: bool,
    adapter: Option<Adapter>,
    connections: HashMap<String, Connection>,
    generation: u64,
}
impl Session {
    async fn adapter(&mut self) -> Result<Adapter> {
        if let Some(adapter) = &self.adapter {
            return Ok(adapter.clone());
        }
        let adapter = Manager::new()
            .await?
            .adapters()
            .await?
            .into_iter()
            .next()
            .ok_or_else(|| anyhow!("NotFoundError: No Bluetooth adapter"))?;
        self.adapter = Some(adapter.clone());
        Ok(adapter)
    }
    async fn disconnect(&mut self, id: &str, events: &Events) {
        if let Some(mut connection) = self.connections.remove(id) {
            if let Some(task) = connection.notifications.take() {
                task.abort();
            }
            if let Some(peripheral) = connection.peripheral {
                let _ = timeout(Duration::from_secs(2), peripheral.disconnect()).await;
            }
            events
                .send(json!({"type":"disconnected","device":id,"epoch":connection.epoch}))
                .await;
        }
    }
    async fn cleanup(&mut self, events: &Events) {
        if let Some(adapter) = &self.adapter {
            let _ = timeout(Duration::from_secs(1), adapter.stop_scan()).await;
        }
        let ids: Vec<_> = self.connections.keys().cloned().collect();
        for id in ids {
            self.disconnect(&id, events).await;
        }
    }
    async fn connect(
        &mut self,
        id: &str,
        events: &Events,
        notifications: &mpsc::Sender<Value>,
    ) -> Result<Value> {
        self.policy.device(id)?;
        if let Some(connection) = self.connections.get(id) {
            if connection.connected {
                return Ok(json!(connection.epoch));
            }
        }
        self.generation += 1;
        let epoch = self.generation;
        let peripheral =
            if self.mock {
                ensure!(id == "mock-battery", "NotFoundError: Mock device not found");
                None
            } else {
                let adapter = self.adapter().await?;
                ensure!(
                    adapter.adapter_state().await? == CentralState::PoweredOn,
                    "NetworkError: Bluetooth adapter is not powered on"
                );
                // Scan only after a granted device is explicitly connected. IDs, never names, select devices.
                adapter.start_scan(ScanFilter::default()).await?;
                let found = timeout(Duration::from_secs(8), async {
                    loop {
                        if let Some(p) = adapter
                            .peripherals()
                            .await?
                            .into_iter()
                            .find(|p| p.id().to_string() == id)
                        {
                            return Ok::<_, anyhow::Error>(p);
                        }
                        tokio::time::sleep(Duration::from_millis(200)).await;
                    }
                })
                .await;
                let _ = adapter.stop_scan().await;
                Some(found.map_err(|_| {
                    anyhow!("NotFoundError: Granted device not found during scan")
                })??)
            };
        self.connections.insert(
            id.into(),
            Connection {
                peripheral: peripheral.clone(),
                epoch,
                connected: false,
                characteristics: vec![],
                subscriptions: HashSet::new(),
                notifications: None,
                value: vec![85],
            },
        );
        let mut characteristics = vec![];
        let mut task = None;
        if let Some(p) = &peripheral {
            p.connect().await?;
            p.discover_services().await?;
            characteristics = p
                .services()
                .into_iter()
                .filter(|s| s.primary)
                .flat_map(|s| s.characteristics)
                .collect();
            ensure!(
                characteristics.len() <= 512,
                "QuotaExceededError: Too many GATT characteristics"
            );
            let mut stream = p.notifications().await?;
            let tx = notifications.clone();
            let device = id.to_owned();
            task = Some(tokio::spawn(async move {
                while let Some(value) = stream.next().await {
                    if value.value.len() <= MAX_VALUE && tx.send(json!({"type":"notification","device":device,"epoch":epoch,"service":value.service_uuid.to_string(),"characteristic":value.uuid.to_string(),"value":value.value})).await.is_err() { break; }
                }
            }));
        }
        let connection = self.connections.get_mut(id).unwrap();
        connection.characteristics = characteristics;
        connection.notifications = task;
        connection.connected = true;
        events
            .send(json!({"type":"connected","device":id,"epoch":epoch}))
            .await;
        Ok(json!(epoch))
    }
    async fn execute(
        &mut self,
        command: &Command,
        events: &Events,
        notifications: &mpsc::Sender<Value>,
    ) -> Result<Value> {
        let data = &command.data;
        match command.method.as_str() {
            "devices" => {
                return Ok(json!(self
                    .policy
                    .devices
                    .iter()
                    .map(|d| json!({"id":d.id,"name":d.name}))
                    .collect::<Vec<_>>()))
            }
            "available" => {
                if self.policy.devices.is_empty() {
                    return Ok(json!(false));
                }
                if self.mock {
                    return Ok(json!(true));
                }
                return Ok(json!(
                    self.adapter().await?.adapter_state().await? == CentralState::PoweredOn
                ));
            }
            _ => {}
        }
        let id = data["device"]
            .as_str()
            .ok_or_else(|| anyhow!("TypeError: Missing device ID"))?;
        self.policy.device(id)?;
        if command.method == "connect" {
            return self.connect(id, events, notifications).await;
        }
        if command.method == "disconnect" {
            self.disconnect(id, events).await;
            return Ok(Value::Null);
        }
        let service = uuid(
            data["service"]
                .as_str()
                .ok_or_else(|| anyhow!("TypeError: Missing service UUID"))?,
        )?;
        let grant = self.policy.service(id, &service.to_string())?.clone();
        let connection = self
            .connections
            .get_mut(id)
            .filter(|c| c.connected && Some(c.epoch) == data["epoch"].as_u64())
            .ok_or_else(|| anyhow!("NetworkError: GATT connection is closed or stale"))?;
        let battery = uuid("battery_service")?;
        let echo = uuid("12345678-1234-5678-1234-56789abcdef0")?;
        if command.method == "service" {
            let exists = if self.mock {
                service == battery || service == echo
            } else {
                connection
                    .characteristics
                    .iter()
                    .any(|c| c.service_uuid == service)
            };
            ensure!(exists, "NotFoundError: Primary service not found");
            return Ok(json!(service.to_string()));
        }
        let characteristic = uuid(
            data["characteristic"]
                .as_str()
                .ok_or_else(|| anyhow!("TypeError: Missing characteristic UUID"))?,
        )?;
        let entry = if self.mock {
            let valid = (service == battery && characteristic == uuid("battery_level")?)
                || (service == echo
                    && characteristic == uuid("12345678-1234-5678-1234-56789abcdef1")?);
            ensure!(valid, "NotFoundError: Characteristic not found");
            Characteristic {
                uuid: characteristic,
                service_uuid: service,
                properties: if service == battery {
                    CharPropFlags::READ | CharPropFlags::NOTIFY
                } else {
                    CharPropFlags::READ
                        | CharPropFlags::WRITE
                        | CharPropFlags::WRITE_WITHOUT_RESPONSE
                        | CharPropFlags::NOTIFY
                },
                descriptors: Default::default(),
            }
        } else {
            connection
                .characteristics
                .iter()
                .find(|c| c.uuid == characteristic && c.service_uuid == service)
                .cloned()
                .ok_or_else(|| anyhow!("NotFoundError: Characteristic not found"))?
        };
        let flags = entry.properties;
        match command.method.as_str() {
            "characteristic" => Ok(
                json!({"read":flags.contains(CharPropFlags::READ),"write":flags.contains(CharPropFlags::WRITE),"writeWithoutResponse":flags.contains(CharPropFlags::WRITE_WITHOUT_RESPONSE),"notify":flags.contains(CharPropFlags::NOTIFY),"indicate":flags.contains(CharPropFlags::INDICATE),"broadcast":flags.contains(CharPropFlags::BROADCAST),"authenticatedSignedWrites":flags.contains(CharPropFlags::AUTHENTICATED_SIGNED_WRITES),"reliableWrite":false,"writableAuxiliaries":false}),
            ),
            "read" => {
                ensure!(grant.read, "SecurityError: Bluetooth read is not granted");
                ensure!(
                    flags.contains(CharPropFlags::READ),
                    "NotSupportedError: Characteristic is not readable"
                );
                let bytes = if let Some(p) = &connection.peripheral {
                    p.read(&entry).await?
                } else {
                    connection.value.clone()
                };
                ensure!(
                    bytes.len() <= MAX_VALUE,
                    "QuotaExceededError: GATT value exceeds 512 bytes"
                );
                Ok(json!(bytes))
            }
            "write" | "writeWithoutResponse" => {
                ensure!(grant.write, "SecurityError: Bluetooth write is not granted");
                let without = command.method == "writeWithoutResponse";
                ensure!(
                    flags.contains(if without {
                        CharPropFlags::WRITE_WITHOUT_RESPONSE
                    } else {
                        CharPropFlags::WRITE
                    }),
                    "NotSupportedError: Characteristic does not support this write mode"
                );
                let bytes: Vec<u8> = serde_json::from_value(data["value"].clone())?;
                ensure!(
                    bytes.len() <= MAX_VALUE,
                    "QuotaExceededError: GATT value exceeds 512 bytes"
                );
                if let Some(p) = &connection.peripheral {
                    p.write(
                        &entry,
                        &bytes,
                        if without {
                            WriteType::WithoutResponse
                        } else {
                            WriteType::WithResponse
                        },
                    )
                    .await?;
                } else {
                    connection.value = bytes;
                }
                Ok(Value::Null)
            }
            "subscribe" | "unsubscribe" => {
                ensure!(
                    grant.notify,
                    "SecurityError: Bluetooth notifications are not granted"
                );
                ensure!(
                    flags.intersects(CharPropFlags::NOTIFY | CharPropFlags::INDICATE),
                    "NotSupportedError: Characteristic has no notifications"
                );
                let key = (service, characteristic);
                if command.method == "subscribe" {
                    ensure!(
                        connection.subscriptions.len() < 32
                            || connection.subscriptions.contains(&key),
                        "QuotaExceededError: Too many subscriptions"
                    );
                    if !connection.subscriptions.contains(&key) {
                        if let Some(p) = &connection.peripheral {
                            p.subscribe(&entry).await?;
                        }
                        connection.subscriptions.insert(key);
                    }
                } else if connection.subscriptions.remove(&key) {
                    if let Some(p) = &connection.peripheral {
                        p.unsubscribe(&entry).await?;
                    }
                }
                Ok(Value::Null)
            }
            _ => bail!("NotSupportedError: Unknown Bluetooth operation"),
        }
    }
    fn accepts(&self, event: &Value) -> bool {
        let Some(id) = event["device"].as_str() else {
            return false;
        };
        let Some(connection) = self.connections.get(id) else {
            return false;
        };
        if !connection.connected || event["epoch"].as_u64() != Some(connection.epoch) {
            return false;
        }
        let Some(service) = event["service"].as_str().and_then(|v| uuid(v).ok()) else {
            return false;
        };
        let Some(characteristic) = event["characteristic"].as_str().and_then(|v| uuid(v).ok())
        else {
            return false;
        };
        connection
            .subscriptions
            .contains(&(service, characteristic))
            && self
                .policy
                .service(id, &service.to_string())
                .is_ok_and(|s| s.notify)
    }
}

async fn actor(
    policy: Policy,
    mock: bool,
    mut commands: mpsc::Receiver<Command>,
    mut stop: oneshot::Receiver<()>,
    events: Events,
) {
    let mut session = Session {
        policy,
        mock,
        adapter: None,
        connections: HashMap::new(),
        generation: 0,
    };
    let (notification_tx, mut notifications) = mpsc::channel(32);
    let mut tick = tokio::time::interval(Duration::from_millis(500));
    let work = async {
        loop {
            tokio::select! {
                command = commands.recv() => {
                    let Some(command) = command else {break;};
                    let result = timeout(OP_TIMEOUT, session.execute(&command, &events, &notification_tx)).await;
                    let result = result.unwrap_or_else(|_| Err(anyhow!("NetworkError: Bluetooth operation timed out")));
                    if result.is_err() && command.method == "connect" {
                        if let Some(id) = command.data["device"].as_str() {session.disconnect(id, &events).await;}
                        if let Some(adapter) = &session.adapter {let _ = timeout(Duration::from_secs(1), adapter.stop_scan()).await;}
                    }
                    let event = match result {Ok(value) => json!({"type":"result","id":command.id,"ok":true,"value":value}), Err(error) => json!({"type":"result","id":command.id,"ok":false,"error":format!("{error:#}")})};
                    events.send(event).await;
                }
                Some(event) = notifications.recv() => { if session.accepts(&event) {events.send(event).await;} }
                _ = tick.tick() => {
                    let ids: Vec<_> = session.connections.keys().cloned().collect();
                    for id in ids {
                        let connection = &session.connections[&id];
                        if let Some(p) = &connection.peripheral {
                            if !matches!(timeout(Duration::from_secs(1), p.is_connected()).await, Ok(Ok(true))) {session.disconnect(&id, &events).await;}
                        } else if connection.connected {
                            for (service, characteristic) in &connection.subscriptions {
                                events.send(json!({"type":"notification","device":id,"epoch":connection.epoch,"service":service.to_string(),"characteristic":characteristic.to_string(),"value":connection.value})).await;
                            }
                        }
                    }
                }
            }
        }
    };
    tokio::select! { _ = &mut stop => {}, _ = work => {} }
    session.cleanup(&events).await;
}

pub fn scan(seconds: u64) -> Result<()> {
    ensure!((1..=30).contains(&seconds), "--seconds must be 1..30");
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    runtime.block_on(async {
        let adapter = timeout(OP_TIMEOUT, async {Manager::new().await?.adapters().await}).await??.into_iter().next().ok_or_else(|| anyhow!("No Bluetooth adapter"))?;
        timeout(OP_TIMEOUT, adapter.start_scan(ScanFilter::default())).await??;
        tokio::time::sleep(Duration::from_secs(seconds)).await;
        let _ = timeout(Duration::from_secs(2), adapter.stop_scan()).await;
        for p in timeout(OP_TIMEOUT, adapter.peripherals()).await?? {
            let properties = timeout(Duration::from_secs(2), p.properties()).await??;
            println!("{}", json!({"id":p.id().to_string(),"name":properties.as_ref().and_then(|p| p.local_name.clone()),"services":properties.map(|p|p.services.iter().map(ToString::to_string).collect::<Vec<_>>()).unwrap_or_default()}));
        }
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn aliases_are_canonical() {
        assert_eq!(
            uuid("battery_service").unwrap().to_string(),
            "0000180f-0000-1000-8000-00805f9b34fb"
        );
        assert!(uuid("*").is_err());
    }
    #[test]
    fn default_policy_denies() {
        assert!(Policy::default().device("mock-battery").is_err());
    }

    #[test]
    fn all_services_grant_stays_bound_to_selected_device() {
        let policy: Policy = serde_json::from_value(json!({"devices": [{
            "id": "selected", "allServices": true, "services": []
        }]}))
        .unwrap();
        let grant = policy.service("selected", "any-service").unwrap();
        assert!(grant.read && grant.write && grant.notify);
        assert!(policy.service("other-device", "any-service").is_err());
        let restricted: Policy = serde_json::from_value(json!({"devices": [{
            "id": "selected", "services": [{"uuid": "battery", "read": true}]
        }]}))
        .unwrap();
        assert!(restricted.service("selected", "other-service").is_err());
        let grant = restricted.service("selected", "battery").unwrap();
        assert!(grant.read && !grant.write && !grant.notify);
    }

    #[tokio::test]
    async fn native_boundary_rejects_forged_requests_before_adapter_access() {
        let (tx, _rx) = mpsc::channel(32);
        let (wake, _wake_rx) = std::sync::mpsc::sync_channel(1);
        let events = Events { tx, wake };
        let (notifications, _) = mpsc::channel(32);
        let mut session = Session {
            policy: Policy::default(),
            mock: false,
            adapter: None,
            connections: HashMap::new(),
            generation: 0,
        };
        for method in ["connect", "read", "write", "subscribe"] {
            let result = session.execute(&Command {id:1, method:method.into(), data:json!({"device":"forged","service":"battery_service","characteristic":"battery_level","epoch":1,"value":[1]})}, &events, &notifications).await;
            assert!(result
                .unwrap_err()
                .to_string()
                .starts_with("SecurityError:"));
            assert!(session.adapter.is_none());
            assert!(session.connections.is_empty());
        }
    }
}
