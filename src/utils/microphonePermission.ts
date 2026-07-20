const MICROPHONE_PERMISSION_GRANTED_KEY = 'evolucao-clinica:microphone-permission-granted';

export const hasRememberedMicrophonePermission = () => {
  try {
    return window.localStorage.getItem(MICROPHONE_PERMISSION_GRANTED_KEY) === 'true';
  } catch {
    return false;
  }
};

export const rememberMicrophonePermission = () => {
  try {
    window.localStorage.setItem(MICROPHONE_PERMISSION_GRANTED_KEY, 'true');
  } catch {
    // A gravação continua disponível mesmo quando o armazenamento local não puder ser usado.
  }
};
