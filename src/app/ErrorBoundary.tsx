import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {logger} from '@shared/logging/logger';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{children: React.ReactNode}, State> {
  state: State = {error: null};

  static getDerivedStateFromError(error: Error): State {
    return {error};
  }

  componentDidCatch(error: Error): void {
    logger.error('UI error boundary caught', error, {source: 'ErrorBoundary'});
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>Unexpected error</Text>
          <Text style={styles.body}>The app hit a problem. You can try again without losing local data.</Text>
          <Pressable
            accessibilityRole="button"
            style={styles.btn}
            onPress={() => this.setState({error: null})}>
            <Text style={styles.btnText}>Reload UI</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F5F8FA'},
  title: {fontSize: 22, fontWeight: '800', marginBottom: 8, color: '#0F172A'},
  body: {fontSize: 15, textAlign: 'center', color: '#64748B', marginBottom: 20},
  btn: {backgroundColor: '#145A6E', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10},
  btnText: {color: '#FFFFFF', fontWeight: '700'},
});
