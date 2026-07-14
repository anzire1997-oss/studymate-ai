import React, { useState, useEffect } from "react";
import { View, TextInput, Pressable, StyleSheet, Modal, ScrollView } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import { ThemeText } from "@/components/ThemeText";
import { useSettings } from "@/context/SettingsContext";
import { Card } from "@/components/card";
import { useThemeColors } from "@/hooks/useThemeColors";

export type ScheduleData = {
  schedule_id?: number;
  title?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string;
};

type Props = {
  initialData: ScheduleData;
  onSave: (data: ScheduleData) => void;
  onDelete?: (schedule_id: number) => void;
  children: React.ReactNode;
};

const daysOptions = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
];

export function CourseScheduleEditor({ initialData, onSave, onDelete, children }: Props) {
  const colors = useThemeColors();
  const db = useSQLiteContext();
  const { defaultDept } = useSettings();
  const [isModalVisible, setModalVisible] = useState(false);
  const [courses, setCourses] = useState<{id: number, title: string}[]>([]);
  
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [dayOfWeek, setDayOfWeek] = useState(initialData?.day_of_week ?? 1);
  const [startTime, setStartTime] = useState(initialData?.start_time ?? "08:00");
  const [endTime, setEndTime] = useState(initialData?.end_time ?? "09:15");
  const [location, setLocation] = useState(initialData?.location ?? "");

  const open = () => setModalVisible(true);
  const close = () => setModalVisible(false);

  useEffect(() => {
    if (isModalVisible && !initialData?.schedule_id) {
      const fetchCourses = async () => {
        try {
          if (defaultDept === 'all') {
            const res = await db.getAllAsync<{id: number, title: string}>('SELECT id, title FROM courses ORDER BY title ASC');
            setCourses(res);
          } else {
            const query = `
              SELECT c.id, c.title 
              FROM courses c
              JOIN departments d ON c.department_id = d.id
              WHERE d.name = ? OR d.name = 'ALL'
              ORDER BY c.title ASC
            `;
            const res = await db.getAllAsync<{id: number, title: string}>(query, [defaultDept]);
            setCourses(res);
          }
        } catch (err) {
          console.error(err);
        }
      };
      fetchCourses();
    }
  }, [isModalVisible, initialData?.schedule_id, defaultDept]);

  const filteredCourses = courses.filter(c => c.title.toLowerCase().includes(title.toLowerCase()));

  const handleSave = () => {
    onSave({
      schedule_id: initialData?.schedule_id,
      title: title.trim(),
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      location: location.trim()
    });
    close();
  };

  return (
    <>
      <Pressable onPress={open}>
        {children}
      </Pressable>

      <Modal visible={isModalVisible} transparent onRequestClose={close} animationType="fade">
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={styles.modalCenter}>
          <Card style={[styles.container, { backgroundColor: colors.graywhite }]}>
            <ThemeText variant="headline" color="graydark" style={styles.title}>
              {initialData?.schedule_id ? "Edit schedule" : "New schedule"}
            </ThemeText>

            {!initialData?.schedule_id && (
              <View style={{ zIndex: 100 }}>
                <ThemeText variant="subtitle2" color="grayMedium" style={styles.label}>Course name</ThemeText>
                <TextInput
                  style={[styles.input, { borderColor: colors.grayLight, color: colors.graydark }]}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Search or create (Ex: Math 101)"
                  placeholderTextColor={colors.grayMedium}
                />
                
                {filteredCourses.length > 0 && title !== "" && (
                  <ScrollView style={[styles.autocompleteContainer, { borderColor: colors.grayLight, backgroundColor: colors.graywhite }]} keyboardShouldPersistTaps="handled">
                    {filteredCourses.map(course => (
                      <Pressable 
                        key={course.id} 
                        style={[styles.autocompleteItem, { borderBottomColor: colors.grayLight }]}
                        onPress={() => setTitle(course.title)}
                      >
                        <ThemeText variant="body3" color="graydark">{course.title}</ThemeText>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Day of week */}
            <ThemeText variant="subtitle2" color="grayMedium" style={styles.label}>Day</ThemeText>
            <View style={styles.daysRow}>
              {daysOptions.map(day => (
                <Pressable
                  key={day.value}
                  style={[
                    styles.dayChip,
                    dayOfWeek === day.value ? { backgroundColor: colors.tint, borderColor: colors.tint } : { borderColor: colors.grayLight }
                  ]}
                  onPress={() => setDayOfWeek(day.value)}
                >
                  <ThemeText
                    variant="body3"
                    color={dayOfWeek === day.value ? "graywhite" : "graydark"}
                  >
                    {day.label}
                  </ThemeText>
                </Pressable>
              ))}
            </View>

            {/* Start and end time */}
            <View style={styles.timeRow}>
              <View style={styles.flex1}>
                <ThemeText variant="subtitle2" color="grayMedium" style={styles.label}>Start (HH:MM)</ThemeText>
                <TextInput
                  style={[styles.input, { borderColor: colors.grayLight, color: colors.graydark }]}
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="08:00"
                  placeholderTextColor={colors.grayMedium}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={styles.flex1}>
                <ThemeText variant="subtitle2" color="grayMedium" style={styles.label}>End (HH:MM)</ThemeText>
                <TextInput
                  style={[styles.input, { borderColor: colors.grayLight, color: colors.graydark }]}
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="09:15"
                  placeholderTextColor={colors.grayMedium}
                />
              </View>
            </View>

            {/* Room / Location */}
            <ThemeText variant="subtitle2" color="grayMedium" style={styles.label}>Room / Location</ThemeText>
            <TextInput
              style={[styles.input, { borderColor: colors.grayLight, color: colors.graydark }]}
              value={location}
              onChangeText={setLocation}
              placeholder="Ex: 509(2) BOA"
              placeholderTextColor={colors.grayMedium}
            />

            {/* Actions */}
            <View style={styles.actions}>
              {initialData?.schedule_id && onDelete && (
                <Pressable 
                  style={[styles.button, styles.cancelButton, { borderColor: '#DC0A2D', marginRight: 'auto' }]} 
                  onPress={() => {
                    onDelete(initialData.schedule_id!);
                    close();
                  }}
                >
                  <ThemeText variant="body3" style={{ color: '#DC0A2D' }}>Delete</ThemeText>
                </Pressable>
              )}
              <Pressable style={[styles.button, styles.cancelButton, { borderColor: colors.grayLight }]} onPress={close}>
                <ThemeText variant="body3" color="graydark">Cancel</ThemeText>
              </Pressable>
              <Pressable style={[styles.button, { backgroundColor: colors.tint }]} onPress={handleSave}>
                <ThemeText variant="body3" color="graywhite">Save</ThemeText>
              </Pressable>
            </View>
          </Card>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalCenter: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    pointerEvents: 'box-none'
  },
  container: {
    padding: 16,
    width: '100%',
    maxWidth: 400,
  },
  title: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 6,
    marginTop: 12,
  },
  daysRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  flex1: {
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  autocompleteContainer: {
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 4,
  },
  autocompleteItem: {
    padding: 12,
    borderBottomWidth: 1,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 24,
    gap: 12,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
    alignItems: "center",
  },
  cancelButton: {
    borderWidth: 1,
    backgroundColor: "transparent",
  },
});
