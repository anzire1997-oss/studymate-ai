import { Row } from "@/components/Row";
import { ThemeText } from "@/components/ThemeText";
import { Card } from "@/components/card";
import { Radio } from "@/components/radio";
import { Shadows } from "@/constants/Shadows";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useRef, useState } from "react";
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";

export type DeptFilter = "all" | "ME" | "EEE" | "CSE";
export type DayFilter = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6; // -1 = today

type Props = {
  deptValue: DeptFilter;
  dayValue: DayFilter;
  onDeptChange: (v: DeptFilter) => void;
  onDayChange: (v: DayFilter) => void;
};

const deptOptions: { label: string; value: DeptFilter }[] = [
  { label: "All", value: "all" },
  { label: "ME", value: "ME" },
  { label: "EEE", value: "EEE" },
  { label: "CSE", value: "CSE" },
];

const dayOptions: { label: string; value: DayFilter }[] = [
  { label: "Today", value: -1 },
  { label: "Monday", value: 1 },
  { label: "Tuesday", value: 2 },
  { label: "Wednesday", value: 3 },
  { label: "Thursday", value: 4 },
  { label: "Friday", value: 5 },
];

export function FilterButton({ deptValue, dayValue, onDeptChange, onDayChange }: Props) {
  const buttonRef = useRef<View>(null);
  const [position, setPosition] = useState<null | { top: number; right: number }>(null);
  const colors = useThemeColors();
  const [isModalVisible, setModalVisible] = useState(false);

  const open = () => {
    buttonRef.current?.measureInWindow((x, y, width, height) => {
      setPosition({ top: y + height + 4, right: Dimensions.get("window").width - x - width });
      setModalVisible(true);
    });
  };

  const close = () => setModalVisible(false);

  return (
    <>
      <Pressable onPress={open}>
        <View ref={buttonRef} style={[styles.button, { backgroundColor: colors.graywhite }]}>
          <ThemeText variant="body3" color="graydark">⚙</ThemeText>
        </View>
      </Pressable>

      <Modal visible={isModalVisible} transparent onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={[styles.popup, { backgroundColor: colors.tint, ...position }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Department filter */}
            <ThemeText style={styles.title} variant="subtitle2" color="graywhite">Department</ThemeText>
            <Card style={styles.card}>
              {deptOptions.map((option) => (
                <Pressable key={option.value} onPress={() => onDeptChange(option.value)}>
                  <Row gap={8}>
                    <Radio checked={option.value === deptValue} />
                    <ThemeText variant="subtitle1" color="graydark">{option.label}</ThemeText>
                  </Row>
                </Pressable>
              ))}
            </Card>

            {/* Day filter */}
            <ThemeText style={[styles.title, { marginTop: 12 }]} variant="subtitle2" color="graywhite">Day</ThemeText>
            <Card style={styles.card}>
              {dayOptions.map((option) => (
                <Pressable key={option.value} onPress={() => onDayChange(option.value)}>
                  <Row gap={8}>
                    <Radio checked={option.value === dayValue} />
                    <ThemeText variant="subtitle1" color="graydark">{option.label}</ThemeText>
                  </Row>
                </Pressable>
              ))}
            </Card>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  popup: { position: "absolute", width: 160, padding: 8, paddingTop: 16, gap: 8, borderRadius: 12, maxHeight: 400, ...Shadows.dp2 },
  title: { paddingLeft: 12, marginBottom: 4 },
  card: { paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
});
