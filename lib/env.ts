import { EidosSharedEnvChannelName, MainServiceWorkerMsgType } from "./const"

const mainServiceWorkerChannel = new BroadcastChannel(EidosSharedEnvChannelName)

export class Env {
  private _env: Record<string, any>
  constructor() {
    this._env = {}
    this.initListener()
  }

  initListener() {
    mainServiceWorkerChannel.onmessage = (e) => {
      const { type, data } = e.data
      if (type === MainServiceWorkerMsgType.SetData) {
        this._env = data
      }
    }
  }

  set(key: string, value: any) {
    this._env[key] = value
  }

  get(key: string) {
    return this._env[key]
  }
}

export const workerEnv = new Env()
