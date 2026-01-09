import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ActionSheetIOS,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface CaptureInputProps {
  onSend: (message: string) => void;
  onAttachImage: () => void;
  onAttachFile: () => void;
  onTakePhoto: () => void;
  disabled?: boolean;
}

export function CaptureInput({
  onSend,
  onAttachImage,
  onAttachFile,
  onTakePhoto,
  disabled = false,
}: CaptureInputProps) {
  const [message, setMessage] = useState('');

  const handleSend = () => {
    if (message.trim() && !disabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSend(message.trim());
      setMessage('');
    }
  };

  const showAttachmentOptions = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library', 'Attach File'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            onTakePhoto();
          } else if (buttonIndex === 2) {
            onAttachImage();
          } else if (buttonIndex === 3) {
            onAttachFile();
          }
        }
      );
    } else {
      // Android - show alert dialog
      Alert.alert('Add Attachment', 'Choose an option', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Photo', onPress: onTakePhoto },
        { text: 'Choose from Library', onPress: onAttachImage },
        { text: 'Attach File', onPress: onAttachFile },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      {/* Center: Input field */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={message}
          onChangeText={setMessage}
          placeholder="Message"
          placeholderTextColor="#999"
          multiline
          maxLength={5000}
          editable={!disabled}
          returnKeyType="default"
          blurOnSubmit={false}
        />
      </View>

      {/* Right: Attachment or Send button */}
      {message.trim() ? (
        <TouchableOpacity
          style={styles.sendButton}
          onPress={handleSend}
          disabled={disabled}
        >
          {disabled ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.iconButton}
          onPress={showAttachmentOptions}
          disabled={disabled}
        >
          <Ionicons
            name="attach-outline"
            size={28}
            color={disabled ? '#999' : '#8E8E93'}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderTopWidth: 0.5,
    borderTopColor: '#C8C8CD',
    minHeight: 52,
  },
  iconButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputContainer: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 18,
    paddingHorizontal: 12,
    minHeight: 36,
    maxHeight: 120,
    justifyContent: 'center',
    marginHorizontal: 6,
  },
  input: {
    fontSize: 17,
    color: '#000',
    maxHeight: 100,
    paddingVertical: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

