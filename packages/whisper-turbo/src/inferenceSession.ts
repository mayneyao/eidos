import { Session } from "./session.worker";
import * as Comlink from "comlink";
import { Result } from "true-myth";
import { AvailableModels } from "./models";
import { Segment } from "whisper-webgpu";

//User facing API
export class InferenceSession {
    private session: Comlink.Remote<Session> | Session | null;
    private innerWorker: Worker | null; //Keep a reference to the worker so we can terminate it

    constructor(session: Comlink.Remote<Session> | Session, worker?: Worker) {
        this.session = session;
        this.innerWorker = worker || null;
    }

    async initSession(
        selectedModel: AvailableModels,
        onProgress: (progress: number) => void
    ): Promise<Result<void, Error>> {
        return await this.session!.initSession(selectedModel, onProgress);
    }

    public async transcribe(
        audio: Uint8Array,
        raw_audio: boolean,
        options: any
    ): Promise<Result<any, Error>>;

    public async transcribe(
        audio: Uint8Array,
        raw_audio: boolean,
        options: any,
        callback: (decoded: Segment) => void
    ): Promise<Result<void, Error>>;

    async transcribe(
        audio: Uint8Array,
        raw_audio: boolean,
        options: any,
        callback?: (decoded: Segment) => void
    ): Promise<Result<any | void, Error>> {
        if (this.session == null) {
            return Result.err(new Error("Session not initialized"));
        }

        if (callback) {
            if (this.session instanceof Session) {
                return await this.session.stream(
                    audio,
                    raw_audio,
                    options,
                    callback
                );
            } else {
                return await this.session!.stream(
                    audio,
                    raw_audio,
                    options,
                    Comlink.proxy(callback)
                );
            }
        } else {
            return await this.session!.run(audio, options);
        }
    }

    public destroy(): void {
        if (this.innerWorker !== null) {
            console.warn("Terminating worker");
            this.innerWorker.terminate();
        }
        this.session = null;
    }
}
