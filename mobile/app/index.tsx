import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { Loading } from '@/ui';
import { Screen } from '@/ui';

export default function Entry() {
  useEffect(() => {
    AsyncStorage.getItem('onboarding_complete').then((done) => {
      router.replace(done ? '/(tabs)' : '/onboarding');
    }).catch(() => router.replace('/onboarding'));
  }, []);
  return <Screen><Loading /></Screen>;
}
