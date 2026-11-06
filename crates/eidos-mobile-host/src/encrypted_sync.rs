//! Trusted native encrypted Sync. Keys never cross the mobile WebView boundary.
use anyhow::{anyhow, ensure, Result};
use graft_sdk::{
    e2ee::{
        self, EncryptedHttpClient, FileCheckpointStore, FileInitializationJournal,
        FileMultipartJournalProvider, FileRefMutationJournalProvider,
        InitialConfigPublicationOutcome, InitializationIntent, InitializationJournal, RepositoryId,
        SecretSession, SessionBinding,
    },
    EncryptedTransferBudget, RemoteConfig, RemoteCredentials, RepositorySession,
};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use zeroize::Zeroizing;

pub(crate) struct EncryptedSync {
    pub credentials: RemoteCredentials,
    pub config: RemoteConfig,
    secret: SecretSession,
    client: EncryptedHttpClient,
    runtime: tokio::runtime::Runtime,
    pub directories: [PathBuf; 3],
}

impl EncryptedSync {
    pub fn new(root: &Path, request: &Value) -> Result<Self> {
        let text = |key: &str| {
            request[key]
                .as_str()
                .filter(|value| !value.is_empty())
                .ok_or_else(|| anyhow!("Missing encrypted Sync {key}"))
        };
        let url = text("url")?;
        let parsed = url::Url::parse(url)?;
        ensure!(
            parsed.username().is_empty()
                && parsed.password().is_none()
                && parsed.query().is_none()
                && parsed.fragment().is_none(),
            "Invalid encrypted Sync address"
        );
        let uuid = text("uuid")?;
        let bytes = uuid.replace('-', "");
        ensure!(
            bytes.len() == 32 && bytes.is_ascii(),
            "Invalid encrypted repository identity"
        );
        let mut identity = [0u8; 16];
        for (index, byte) in identity.iter_mut().enumerate() {
            *byte = u8::from_str_radix(&bytes[index * 2..index * 2 + 2], 16)?;
        }
        let binding = SessionBinding::new(
            parsed.origin().ascii_serialization(),
            "self-hosted".into(),
            RepositoryId::from_bytes(identity)?,
        )?;
        let credentials = RemoteCredentials::explicit();
        credentials.set_http_bearer_token(
            "origin",
            request["token"].as_str().unwrap_or_default().into(),
        )?;
        // Validate transport before enrolling private checkpoint state.
        EncryptedHttpClient::new(
            url,
            "origin".into(),
            credentials.clone(),
            SecretSession::new(binding.clone(), None)?,
        )?;
        let base = PathBuf::from(text("stateDirectory")?);
        ensure!(
            base.is_absolute(),
            "Encrypted Sync storage must be absolute"
        );
        let probe = RepositorySession::new(root);
        probe.validate_encrypted_host_directory_targets(std::slice::from_ref(&base))?;
        if !base.exists() {
            std::fs::create_dir_all(&base)?;
            set_private(&base)?;
        }
        e2ee::native_fs::validate_private_directory(&base)?;
        let slot = base.join(format!(
            "{:x}",
            Sha256::digest(format!("{url}\0{uuid}").as_bytes())
        ));
        let created = match std::fs::create_dir(&slot) {
            Ok(()) => {
                set_private(&slot)?;
                true
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => false,
            Err(error) => return Err(error.into()),
        };
        e2ee::native_fs::validate_private_directory(&slot)?;
        let directories = [
            slot.join("checkpoint"),
            slot.join("recovery"),
            slot.join("staging"),
        ];
        if created {
            for path in &directories {
                e2ee::native_fs::create_private_directory(path)?;
            }
            e2ee::native_fs::create_private_directory(&directories[1].join("multipart"))?;
        }
        probe.validate_encrypted_host_directories(&directories)?;
        let store = if created {
            FileCheckpointStore::create(&directories[0], &binding)
        } else {
            FileCheckpointStore::open(&directories[0], &binding)
        }?;
        let refs = if created {
            FileRefMutationJournalProvider::create(&directories[1], &binding)
        } else {
            FileRefMutationJournalProvider::open(&directories[1], &binding)
        }?;
        let multipart = if created {
            FileMultipartJournalProvider::create(directories[1].join("multipart"), &binding)
        } else {
            FileMultipartJournalProvider::open(directories[1].join("multipart"), &binding)
        }?;
        let secret = SecretSession::with_checkpoint_store(binding, Arc::new(store))?;
        let config = RemoteConfig::EncryptedHttp {
            url: url.into(),
            uuid: uuid.into(),
        };
        credentials.set_encrypted_session_with_recovery(
            "origin",
            &config,
            secret.clone(),
            EncryptedTransferBudget {
                private_directory: directories[2].clone(),
                max_buffered_plaintext: 64 * 1024 * 1024,
                max_ciphertext_spool: 1024 * 1024 * 1024,
            },
            Arc::new(refs),
            Arc::new(multipart),
        )?;
        let client =
            EncryptedHttpClient::new(url, "origin".into(), credentials.clone(), secret.clone())?;
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()?;
        Ok(Self {
            credentials,
            config,
            secret,
            client,
            runtime,
            directories,
        })
    }

    pub fn unlock(&self, password: &str) -> Result<()> {
        ensure!(
            !password.is_empty() && password.len() <= 1024,
            "Sync password must contain 1–1024 UTF-8 bytes"
        );
        self.wait(
            self.client
                .unlock(Zeroizing::new(password.as_bytes().to_vec())),
        )?;
        Ok(())
    }

    pub fn initialize(&self, password: &str, session: &RepositorySession) -> Result<()> {
        ensure!(
            !password.is_empty() && password.len() <= 1024,
            "Sync password must contain 1–1024 UTF-8 bytes"
        );
        let metadata = session.repository_metadata()?;
        let intent = InitializationIntent::new(
            metadata
                .current_branch
                .ok_or_else(|| anyhow!("Save a local version first"))?,
            metadata
                .current_head
                .ok_or_else(|| anyhow!("Save a local version first"))?,
        )?;
        let directory = self.directories[1].clone();
        // The SDK owns exact random-root recovery and publication uncertainty.
        let exists = FileInitializationJournal::open(&directory, self.secret.binding()).is_ok();
        let future = self.secret.prepare_native_initial_config_with_intent(
            Zeroizing::new(password.as_bytes().to_vec()),
            directory,
            !exists,
            intent,
        )?;
        let journal = self.wait(future)?;
        let outcome = self.wait(self.client.publish_initial_config(journal))?;
        ensure!(
            matches!(outcome, InitialConfigPublicationOutcome::Confirmed),
            "Encrypted initialization is pending; retry with the same Space and password"
        );
        Ok(())
    }

    pub fn push_initial(&self, session: &RepositorySession) -> Result<()> {
        let journal = FileInitializationJournal::open(&self.directories[1], self.secret.binding())?;
        let record = journal.load(self.secret.binding())?;
        let intent = record
            .intent
            .ok_or_else(|| anyhow!("Missing initial Sync intent"))?;
        let metadata = session.repository_metadata()?;
        intent.require_source(
            metadata.current_branch.as_deref().unwrap_or_default(),
            metadata.current_head.as_deref().unwrap_or_default(),
        )?;
        session.push_initialization_intent_with_config("origin", &self.config, &intent)?;
        Ok(())
    }

    pub fn disconnect(&self) -> Result<()> {
        self.runtime
            .block_on(self.credentials.clear_encrypted_session("origin"))?;
        self.credentials.clear_http_bearer_token("origin")?;
        Ok(())
    }

    fn wait<T, E: std::error::Error + Send + Sync + 'static>(
        &self,
        future: impl std::future::Future<Output = std::result::Result<T, E>>,
    ) -> Result<T> {
        let token = crate::cancellation::current_token();
        self.runtime.block_on(async {
            tokio::select! {
                result = future => result.map_err(anyhow::Error::from),
                _ = async {
                    loop {
                        if token.as_ref().is_some_and(|value| value.is_cancelled()) { break; }
                        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
                    }
                } => { self.secret.lock().await; Err(anyhow!("Graft operation cancelled")) }
            }
        })
    }
}

#[cfg(unix)]
fn set_private(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
}
#[cfg(not(unix))]
fn set_private(path: &Path) -> std::io::Result<()> {
    e2ee::native_fs::validate_private_directory(path)
}
