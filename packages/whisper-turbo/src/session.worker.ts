import * as whisper from "whisper-webgpu";
import * as Comlink from "comlink";
import { Result } from "true-myth";
import { AvailableModels, Model } from "./models";
import ModelDB from "./db/modelDB";

export class Session {
    whisperSession: whisper.Session | undefined;

    public async initSession(
        selectedModel: AvailableModels,
        onProgress: (progress: number) => void
    ): Promise<Result<void, Error>> {
        if (this.whisperSession) {
            return Result.err(
                new Error(
                    "Session already initialized. Call `destroy()` first."
                )
            );
        }
        const modelResult = await this.loadModel(selectedModel, onProgress);
        if (modelResult.isErr) {
            return Result.err(modelResult.error);
        }
        const model = modelResult.value;
        await whisper.default();
        const builder = new whisper.SessionBuilder();
        const session = await builder
            .setModel(model.data)
            .setTokenizer(model.tokenizer)
            .build();
        this.whisperSession = session;
        return Result.ok(undefined);
    }

    private async loadModel(
        selectedModel: AvailableModels,
        onProgress: (progress: number) => void
    ): Promise<Result<Model, Error>> {
        const db = await ModelDB.create(); //TODO: don't create a new db every time
        const dbResult = await db.getModel(selectedModel, onProgress);
        if (dbResult.isErr) {
            return Result.err(
                new Error(
                    `Failed to load model ${selectedModel} with error: ${dbResult.error}`
                )
            );
        }
        const dbModel = dbResult.value;

        const modelResult = await Model.fromDBModel(dbModel, db);

        if (modelResult.isErr) {
            return Result.err(
                new Error(
                    `Failed to transmute model ${selectedModel} with error: ${modelResult.error}`
                )
            );
        }
        const model = modelResult.value;
        return Result.ok(model);
    }

    public async run(
        audio: Uint8Array,
        options: any 
    ): Promise<Result<any, Error>> {
        if (!this.whisperSession) {
            return Result.err(
                new Error(
                    "The session is not initialized. Call `initSession()` method first."
                )
            );
        }

        return Result.ok(await this.whisperSession.run(audio, options));
    }

    public async stream(
        audio: Uint8Array,
        raw_audio: boolean,
        options: any,
        callback: (decoded: whisper.Segment) => void
    ): Promise<Result<void, Error>> {
        if (!this.whisperSession) {
            return Result.err(
                new Error(
                    "The session is not initialized. Call `initSession()` method first."
                )
            );
        }

        return Result.ok(
            await this.whisperSession.stream(
                audio,
                raw_audio,
                options,
                callback
            )
        );
    }
}

if (typeof self !== "undefined") {
    Comlink.expose(Session);
}
