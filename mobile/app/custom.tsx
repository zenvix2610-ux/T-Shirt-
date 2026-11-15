import { useMutation } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Alert, Image, ScrollView, Text } from 'react-native';
import { errorMessage, storeApi } from '@/api';
import { Button, Field, Screen, Title, colors } from '@/ui';

export default function CustomDesign() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [printingType, setPrintingType] = useState('DTF');
  const [size, setSize] = useState('M');
  const [color, setColor] = useState('Black');
  const [qty, setQty] = useState('1');
  const [instructions, setInstructions] = useState('');
  const [artwork, setArtwork] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const submit = useMutation({
    mutationFn: () => {
      const form = new FormData();
      Object.entries({ name, phone, email, printing_type: printingType, size, color, qty, instructions })
        .forEach(([key, value]) => form.append(key, value));
      if (artwork) form.append('artwork', { uri: artwork.uri, name: artwork.fileName ?? 'artwork.jpg', type: artwork.mimeType ?? 'image/jpeg' } as unknown as Blob);
      return storeApi.submitCustomRequest(form);
    },
    onSuccess: (result) => Alert.alert('Request sent', `We’ll contact you soon. Reference: ${result.id}`),
    onError: (error) => Alert.alert('Could not submit request', errorMessage(error)),
  });
  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to attach your artwork.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!result.canceled) setArtwork(result.assets[0]);
  }
  return <Screen><ScrollView keyboardShouldPersistTaps="handled">
    <Title subtitle="Tell us what you’re imagining. Our team will follow up to confirm the quote.">Custom printing</Title>
    <Field label="Your name" value={name} onChangeText={setName} />
    <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
    <Field label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
    <Field label="Printing type (DTF, group, event…)" value={printingType} onChangeText={setPrintingType} />
    <Field label="T-shirt size" value={size} onChangeText={setSize} autoCapitalize="characters" />
    <Field label="Colour" value={color} onChangeText={setColor} />
    <Field label="Quantity" value={qty} onChangeText={setQty} keyboardType="number-pad" />
    <Field label="Special instructions" value={instructions} onChangeText={setInstructions} multiline numberOfLines={4} />
    <Button title={artwork ? 'Choose a different design' : 'Upload design image'} secondary onPress={pickImage} />
    {artwork ? <Image source={{ uri: artwork.uri }} style={{ width: '100%', height: 220, borderRadius: 16, marginVertical: 8 }} resizeMode="contain" /> : null}
    <Text style={{ color: colors.muted, fontSize: 12, marginVertical: 8 }}>Accepted by server: image files up to the configured upload limit.</Text>
    <Button title="Send custom request" disabled={submit.isPending || !name || phone.length < 10 || Number(qty) < 1}
      onPress={() => submit.mutate()} />
  </ScrollView></Screen>;
}
