import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <ScrollView style={styles.container}>
          <Text style={styles.title}>App Crashed</Text>
          <Text style={styles.error}>{String(this.state.error)}</Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', color: 'red', marginTop: 60 },
  error: { fontSize: 14, color: '#333', marginTop: 20 },
});
