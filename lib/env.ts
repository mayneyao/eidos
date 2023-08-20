import { MainServiceWorkerMsgType, mainServiceWorkerChannel } from "./const"

export class Env {
  private _env: Record<string, any>
  constructor() {
    this._env = {}
    this.initListener()
  }

  initListener() {
    mainServiceWorkerChannel.onmessage = (e) => {
      const {
        type,
        data: { key, value },
      } = e.data
      if (type === MainServiceWorkerMsgType.SetData) {
        this.set(key, value)
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
