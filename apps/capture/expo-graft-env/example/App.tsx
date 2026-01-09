import React, { useState } from 'react';
import { StyleSheet, Text, View, Button, TextInput, ScrollView, Alert } from 'react-native';
import ExpoGraftEnv from 'expo-graft-env';
import type { GraftEnvironmentConfig } from 'expo-graft-env';

export default function App() {
  const [accessKeyId, setAccessKeyId] = useState('your-access-key');
  const [secretAccessKey, setSecretAccessKey] = useState('your-secret-key');
  const [region, setRegion] = useState('auto');
  const [endpoint, setEndpoint] = useState('https://s3.eidos.space');
  const [result, setResult] = useState('');

  const handleSetEnvironment = async () => {
    try {
      const config: GraftEnvironmentConfig = {
        AWS_ACCESS_KEY_ID: accessKeyId,
        AWS_SECRET_ACCESS_KEY: secretAccessKey,
        AWS_REGION: region,
        AWS_ENDPOINT: endpoint,
      };

      await ExpoGraftEnv.setEnvironmentVariables(config);
      setResult('✅ Environment variables set successfully');
    } catch (error) {
      setResult(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleGetEnvironment = async (key: string) => {
    try {
      const value = await ExpoGraftEnv.getEnvironmentVariable(key);
      setResult(`${key} = ${value || '(not set)'}`);
    } catch (error) {
      setResult(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleClearEnvironment = async () => {
    try {
      await ExpoGraftEnv.clearEnvironmentVariables();
      setResult('✅ Environment variables cleared');
    } catch (error) {
      setResult(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Graft Environment Config</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>AWS Access Key ID:</Text>
          <TextInput
            style={styles.input}
            value={accessKeyId}
            onChangeText={setAccessKeyId}
            placeholder="Enter access key"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>AWS Secret Access Key:</Text>
          <TextInput
            style={styles.input}
            value={secretAccessKey}
            onChangeText={setSecretAccessKey}
            placeholder="Enter secret key"
            secureTextEntry
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>AWS Region:</Text>
          <TextInput
            style={styles.input}
            value={region}
            onChangeText={setRegion}
            placeholder="Enter region"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>AWS Endpoint:</Text>
          <TextInput
            style={styles.input}
            value={endpoint}
            onChangeText={setEndpoint}
            placeholder="Enter endpoint URL"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.buttonGroup}>
          <Button title="Set Environment" onPress={handleSetEnvironment} />
        </View>

        <View style={styles.buttonGroup}>
          <Button
            title="Get AWS_ACCESS_KEY_ID"
            onPress={() => handleGetEnvironment('AWS_ACCESS_KEY_ID')}
          />
        </View>

        <View style={styles.buttonGroup}>
          <Button title="Clear Environment" onPress={handleClearEnvironment} color="red" />
        </View>

        {result ? (
          <View style={styles.resultContainer}>
            <Text style={styles.resultTitle}>Result:</Text>
            <Text style={styles.result}>{result}</Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 5,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#f9f9f9',
  },
  buttonGroup: {
    marginBottom: 10,
  },
  resultContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  result: {
    fontSize: 14,
    color: '#333',
  },
});
