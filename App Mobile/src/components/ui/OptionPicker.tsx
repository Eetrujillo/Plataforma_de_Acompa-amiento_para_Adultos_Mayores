import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from './AppText';
import { Button } from './Button';

export interface PickerOption {
  value: string;
  label: string;
}

interface OptionPickerProps {
  visible: boolean;
  title: string;
  options: PickerOption[];
  value: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

/**
 * Selector en modal.
 *
 * React Native no tiene `<select>`. Se usa un modal con una lista grande y
 * tocable, apta para el adulto mayor. Se usa para zonas horarias, repetición,
 * fecha y hora.
 */
export function OptionPicker({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
}: OptionPickerProps) {
  const theme = useTheme();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}>
        <SafeAreaView
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderTopLeftRadius: theme.radius.card,
              borderTopRightRadius: theme.radius.card,
            },
          ]}
        >
          <View style={styles.header}>
            <AppText variant="title" style={{ fontSize: theme.font.title * 0.8 }}>
              {title}
            </AppText>
          </View>

          <FlatList
            data={options}
            keyExtractor={(item) => item.value}
            style={styles.list}
            initialNumToRender={16}
            renderItem={({ item }) => {
              const selected = item.value === value;

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    onSelect(item.value);
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      backgroundColor: selected ? theme.colors.infoBg : theme.colors.surface,
                      borderRadius: theme.radius.control,
                      minHeight: theme.controlHeight,
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <AppText
                    style={{
                      fontWeight: selected ? '800' : '500',
                      color: selected ? theme.colors.primary : theme.colors.text,
                    }}
                  >
                    {item.label}
                  </AppText>
                </Pressable>
              );
            }}
          />

          <Button label="Cerrar" variant="secondary" onPress={onClose} />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '85%',
    borderTopWidth: 3,
    padding: 16,
    gap: 12,
  },
  header: { paddingBottom: 4 },
  list: { flexGrow: 0 },
  option: {
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    justifyContent: 'center',
  },
});
