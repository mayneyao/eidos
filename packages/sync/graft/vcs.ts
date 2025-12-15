type CommonVersionControlResult = Promise<Record<string, any>>;

export abstract class BaseGraftVCS {
  // inspect
  abstract info(): CommonVersionControlResult;
  abstract status(): CommonVersionControlResult;
  abstract snapshot(): CommonVersionControlResult;
  abstract audit(): CommonVersionControlResult;
  abstract version(): CommonVersionControlResult;

  // sync
  abstract hydrate(): CommonVersionControlResult;
  abstract fetch(): CommonVersionControlResult;
  abstract pull(): CommonVersionControlResult;
  abstract push(): CommonVersionControlResult;

}