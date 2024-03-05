import { InferenceSession } from "./inferenceSession";
import * as Comlink from "comlink";
import { Session } from "./session.worker";
import { AvailableModels } from "./models";
import { Result } from "true-myth";

export class SessionManager {
    /**
     * Loads a model and returns a Session instance.
     * @param selectedModel - The model to load.
     * @param onLoaded - A callback that is called when the model is loaded.
     * @returns A Promise that resolves with a Session instance.
     *
     */
    public async loadModel(
        selectedModel: AvailableModels,
        onLoaded: (result: any) => void,
        onProgress: (progress: number) => void
    ): Promise<Result<InferenceSession, Error>> {
        const creationResult = await this.createSession(
            true,
            selectedModel,
            onProgress
        );
        if (creationResult.isErr) {
            return Result.err(creationResult.error);
        }
        onLoaded(creationResult.value);
        return Result.ok(creationResult.value);
    }

    /**
     * Creates a new session with the specified models.
     *
     * @param spawnWorker - Determines whether a Web Worker should be used for the session.
     * @param selectedModel - The model to use for the session.
     * @returns A Promise that resolves with a Session instance, or a Remote<Session> instance if a Web Worker was used.
     *
     */
    private async createSession(
        spawnWorker: boolean,
        selectedModel: AvailableModels,
        onProgress: (progress: number) => void
    ): Promise<Result<InferenceSession, Error>> {
        if (spawnWorker && typeof document !== "undefined") {
            const worker = new Worker(
                new URL("./session.worker.js", import.meta.url),
                {
                    type: "module",
                }
            );
            const SessionWorker = Comlink.wrap<typeof Session>(worker);
            const session = await new SessionWorker();
            const initResult = await session.initSession(
                selectedModel,
                Comlink.proxy(onProgress)
            );
            //@ts-ignore
            const [state, data] = initResult.repr;
            if (state === "Err") {
                return Result.err(
                    new Error(
                        "Session initialization failed: " + data.toString()
                    )
                );
            }
            return Result.ok(new InferenceSession(session, worker));
        } else {
            const session = new Session();
            const initResult = await session.initSession(
                selectedModel,
                onProgress
            );
            if (initResult.isErr) {
                console.error("Error initializing session: ", initResult);
                return Result.err(initResult.error);
            }
            return Result.ok(new InferenceSession(session));
        }
    }
}
