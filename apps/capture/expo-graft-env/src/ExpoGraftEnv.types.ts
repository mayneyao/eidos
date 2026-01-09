export type GraftEnvironmentConfig = {
  GRAFT_CONFIG?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_REGION?: string;
  AWS_ENDPOINT?: string;
};

export type ExpoGraftEnvModuleEvents = {
  onConfigChange: (params: ConfigChangeEventPayload) => void;
};

export type ConfigChangeEventPayload = {
  success: boolean;
  message?: string;
};
