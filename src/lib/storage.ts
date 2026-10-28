import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Nativo: Keychain (iOS) / Keystore (Android) vía expo-secure-store.
// Web (solo para vista previa): memoria del proceso; nunca localStorage para tokens.
const memory = new Map<string, string>();
const isWeb = Platform.OS === 'web';

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    if (isWeb) return memory.get(key) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (isWeb) {
      memory.set(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  },
  async remove(key: string): Promise<void> {
    if (isWeb) {
      memory.delete(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};
