import { Modal, Pressable, StyleSheet, View } from "react-native";
import { ThemeText } from "./ThemeText";
import { useThemeColors } from "@/hooks/useThemeColors";
import { getThemePalette, useThemeMode } from "@/context/ThemeModeContext";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
  onCancel,
}: Props) {
  const colors = useThemeColors();
  const { mode } = useThemeMode();
  const palette = getThemePalette(colors, mode);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <View style={[styles.card, { backgroundColor: palette.graywhite || "#FFF" }]}>
          <ThemeText variant="headline" color="graydark">{title}</ThemeText>
          <ThemeText variant="body2" color="grayMedium" style={{ marginTop: 8 }}>
            {message}
          </ThemeText>
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.cancelBtn}>
              <ThemeText variant="body2" color="graydark">{cancelLabel}</ThemeText>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={[styles.confirmBtn, { backgroundColor: destructive ? '#D32F2F' : (palette.tint || "#DC0A2D") }]}
            >
              <ThemeText variant="body2" style={{ color: 'white' }}>{confirmLabel}</ThemeText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    elevation: 5,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 24,
    gap: 12,
  },
  cancelBtn: {
    padding: 12,
  },
  confirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
});
