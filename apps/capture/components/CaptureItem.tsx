import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions } from 'react-native';
import { Capture } from '../db/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAX_IMAGE_WIDTH = SCREEN_WIDTH * 0.7;

interface CaptureItemProps {
  capture: Capture;
  onPress?: (capture: Capture) => void;
  onLongPress?: (capture: Capture) => void;
}

export function CaptureItem({ capture, onPress, onLongPress }: CaptureItemProps) {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const renderContent = () => {
    switch (capture.type) {
      case 'image':
        return (
          <View>
            {capture.content && <Text style={styles.messageText}>{capture.content}</Text>}
            {capture.metadata?.filePath && (
              <Image
                source={{ uri: capture.metadata.filePath }}
                style={[
                  styles.image,
                  {
                    width: Math.min(capture.metadata.width || MAX_IMAGE_WIDTH, MAX_IMAGE_WIDTH),
                    height: capture.metadata.height
                      ? (capture.metadata.height * MAX_IMAGE_WIDTH) / (capture.metadata.width || MAX_IMAGE_WIDTH)
                      : 200,
                  },
                ]}
                resizeMode="cover"
              />
            )}
          </View>
        );

      case 'file':
      case 'audio':
      case 'video':
        return (
          <View>
            {capture.content && <Text style={styles.messageText}>{capture.content}</Text>}
            <View style={styles.fileContainer}>
              <Text style={styles.fileName}>{capture.metadata?.fileName || 'File'}</Text>
              {capture.metadata?.fileSize && (
                <Text style={styles.fileSize}>
                  {(capture.metadata.fileSize / 1024 / 1024).toFixed(2)} MB
                </Text>
              )}
            </View>
          </View>
        );

      default:
        return <Text style={styles.messageText}>{capture.content}</Text>;
    }
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress?.(capture)}
      onLongPress={() => onLongPress?.(capture)}
      activeOpacity={0.7}
    >
      <View style={styles.bubble}>
        {renderContent()}
        <View style={styles.footer}>
          <Text style={styles.timestamp}>{formatTime(capture.created_at)}</Text>
          {capture.synced === 1 && <Text style={styles.syncIndicator}>✓</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    alignItems: 'flex-end',
  },
  bubble: {
    backgroundColor: '#DCF8C6',
    borderRadius: 12,
    padding: 12,
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  messageText: {
    fontSize: 16,
    color: '#000',
    lineHeight: 22,
  },
  image: {
    marginTop: 8,
    borderRadius: 8,
  },
  fileContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  fileSize: {
    fontSize: 12,
    color: '#666',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  timestamp: {
    fontSize: 11,
    color: '#666',
  },
  syncIndicator: {
    fontSize: 12,
    color: '#34B7F1',
  },
});

