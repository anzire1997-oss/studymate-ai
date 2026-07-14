import { ThemeText } from "@/components/ThemeText";
import { Card } from "@/components/card";
import { Image } from "react-native";
import { getThemePalette, useThemeMode } from "@/context/ThemeModeContext";
import { useThemeColors } from "@/hooks/useThemeColors";
import { generateImageResponse } from "@/lib/aiClient";
import * as ImagePicker from "expo-image-picker";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { FilterButton, type DeptFilter, type DayFilter } from "@/components/FilterButton";
import { CourseScheduleEditor, type ScheduleData } from "@/components/CourseScheduleEditor";
import { useSettings } from "@/context/SettingsContext";

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const hours = ["08:00", "09:15", "10:30", "11:45", "14:30", "15:45", "17:00"];
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export default function CalendarPage() {
  const colors = useThemeColors();
  const { mode } = useThemeMode();
  const palette = getThemePalette(colors, mode);

  const db = useSQLiteContext();
  const { defaultDept, isLoading: isSettingsLoading } = useSettings();

  const [deptFilter, setDeptFilter] = useState<DeptFilter>("all");
  const [dayFilter, setDayFilter] = useState<DayFilter>(-1);
  const [loading, setLoading] = useState(false);
  const [extractedInfo, setExtractedInfo] = useState<string>('');
  const [scheduleEvents, setScheduleEvents] = useState<any[]>([]);
  const [allSchedules, setAllSchedules] = useState<any[]>([]);

  useEffect(() => {
    if (!isSettingsLoading) {
      setDeptFilter(defaultDept);
    }
  }, [isSettingsLoading, defaultDept]);

  // All courses for the calendar grid (with department filter)
  const fetchAllSchedules = async () => {
    try {
      let query = 'SELECT c.id, c.title, s.start_time as time, s.day_of_week as day, s.location FROM course_schedules s JOIN courses c ON s.course_id = c.id JOIN departments d ON c.department_id = d.id';
      const params: any[] = [];
      
      if (deptFilter !== "all") {
        query += ' WHERE d.name = ? OR d.name = ?';
        params.push(deptFilter, 'ALL');
      }
      query += ' ORDER BY s.day_of_week, s.start_time ASC';
      
      const schedules = await db.getAllAsync<any>(query, params);
      setAllSchedules(schedules);
    } catch (e) {
      console.error(e);
    }
  };

  // Filtered events for the "Today" section
  const fetchSchedules = async () => {
    try {
      // 1. Fetch one-time events
      const events = await db.getAllAsync<any>('SELECT null as id, null as schedule_id, title, event_time as time, null as end_time, "" as location, "event" as type, 0 as day FROM calendar_events');
      
      // 2. Build dynamic query based on filters
      const dayToUse = dayFilter === -1 ? new Date().getDay() : dayFilter;
      
      let query = 'SELECT c.id, c.title, s.id as schedule_id, s.start_time as time, s.end_time, s.day_of_week as day, s.location, d.name as dept_name, "course" as type FROM course_schedules s JOIN courses c ON s.course_id = c.id JOIN departments d ON c.department_id = d.id WHERE s.day_of_week = ?';
      const params: any[] = [dayToUse];

      if (deptFilter !== "all") {
        // Filter by specific department + ALL courses (common to all)
        query += ' AND (d.name = ? OR d.name = ?)';
        params.push(deptFilter, 'ALL');
      }

      query += ' ORDER BY s.start_time ASC';
      const schedules = await db.getAllAsync<any>(query, params);
      
      setScheduleEvents([...events, ...schedules]);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchAllSchedules();
    fetchSchedules();
  }, [deptFilter, dayFilter]);

  const handleSaveSchedule = async (data: ScheduleData) => {
    if (!data.schedule_id) return;
    try {
      await db.runAsync(
        'UPDATE course_schedules SET day_of_week = ?, start_time = ?, end_time = ?, location = ? WHERE id = ?',
        [data.day_of_week, data.start_time, data.end_time, data.location, data.schedule_id]
      );
      fetchAllSchedules();
      fetchSchedules();
    } catch (e) {
      console.error("Error updating schedule:", e);
    }
  };

  const handleDeleteSchedule = async (id: number) => {
    try {
      await db.runAsync('DELETE FROM course_schedules WHERE id = ?', [id]);
      fetchAllSchedules();
      fetchSchedules();
    } catch (e) {
      console.error("Error deleting:", e);
    }
  };

  const handleCreateSlot = async (data: ScheduleData) => {
    try {
      const title = data.title || "New course";
      let courseRes = await db.getFirstAsync<{id: number}>('SELECT id FROM courses WHERE title = ?', [title]);
      let courseId;
      
      if (!courseRes) {
        const targetDeptName = defaultDept === 'all' ? 'ALL' : defaultDept;
        const deptRes = await db.getFirstAsync<{id: number}>('SELECT id FROM departments WHERE name = ?', [targetDeptName.toUpperCase()]);
        const deptId = deptRes?.id || 4;
        const insertRes = await db.runAsync('INSERT INTO courses (title, course_code, department_id) VALUES (?, ?, ?)', [title, title, deptId]);
        courseId = insertRes.lastInsertRowId;
      } else {
        courseId = courseRes.id;
      }
      
      await db.runAsync(
        'INSERT INTO course_schedules (course_id, day_of_week, start_time, end_time, location) VALUES (?, ?, ?, ?, ?)',
        [courseId, data.day_of_week, data.start_time, data.end_time, data.location]
      );
      
      fetchAllSchedules();
      fetchSchedules();
    } catch (e) {
      console.error("Error creating schedule:", e);
    }
  };

  const handlePickAndExtract = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        alert('Permission to access media library is required!');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 1,
      });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.base64) {
        alert('Unable to retrieve image data');
        return;
      }
      setLoading(true);
      const base64 = asset.base64;
      const imageUrl = `data:image/jpeg;base64,${base64}`;

      const prompt = [
        "You are a schedule extractor for the IUT TVE department.",
        "From the timetable image, extract all weekly courses.",
        "CRUCIAL Context about Departments (ME, EEE, CSE):",
        "Each time slot cell can be divided by horizontal lines. The top section is for 'ME', the middle section for 'EEE', and the bottom for 'CSE'.",
        "If there are no horizontal lines in a cell, the course applies to ALL THREE departments: ['ME', 'EEE', 'CSE'].",
        "CRUCIAL Context about Cell Content:",
        "Inside a section, the top text is the course name (e.g. 'TVE 4425' or 'Math 4437').",
        "The text below it (e.g. '509(2) BOA' or '509(2) SJE' or 'Av lab') is the location and teacher info.",
        "Return ONLY a valid JSON array of objects with exactly these fields:",
        "  - title (string): the course name (e.g., 'TVE 4425', 'Math 4437')",
        "  - departments (string[]): array of departments this course belongs to based on its vertical position in the cell. Can be ['ME'], ['EEE'], ['CSE'], or ['ME', 'EEE', 'CSE'] if no lines.",
        "  - day_of_week (number): 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday",
        "  - start_time (string): start time formatted as HH:MM (e.g., '08:00')",
        "  - end_time (string): end time formatted as HH:MM (e.g., '09:15')",
        "  - location (string): the bottom text in the cell (e.g. '509(2) BOA'), otherwise empty string",
        "IMPORTANT: DO NOT output any step-by-step analysis, reasoning, or extra text. Output ONLY the JSON array. Starting with [ and ending with ]."
      ].join("\\n");

      let response: string;
      try {
        response = await generateImageResponse(prompt, imageUrl);
      } catch (e: any) {
        console.error('Error sending image to API', e);
        setExtractedInfo(`Send error: ${e.message || e}`);
        return;
      }

      if (!response) {
        setExtractedInfo("No response received.");
        return;
      }

      try {
        // Robustly extract the JSON array (from first '[' to last ']')
        const match = response.match(/\[[\s\S]*\]/);
        if (!match) {
          throw new Error("No JSON array found in the AI response.");
        }
        
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Initialize the three fixed departments
          await db.execAsync(`
            INSERT OR IGNORE INTO departments (id, name) VALUES (1, 'ME');
            INSERT OR IGNORE INTO departments (id, name) VALUES (2, 'EEE');
            INSERT OR IGNORE INTO departments (id, name) VALUES (3, 'CSE');
            INSERT OR IGNORE INTO departments (id, name) VALUES (4, 'ALL');
            
          `);

          for (const item of parsed) {
            // AI returns a departments array. If none, assume it's for all 3.
            let depts = (Array.isArray(item.departments) && item.departments.length > 0) 
                          ? item.departments 
                          : ['ME', 'EEE', 'CSE'];

            // If the course is for all 3 departments, use 'ALL' to avoid 3 duplicated rows
            const allThree = ['ME', 'EEE', 'CSE'];
            const deptsUpper = depts.map((d: string) => d.toUpperCase());
            if (allThree.every(d => deptsUpper.includes(d))) {
              depts = ['ALL'];
            }

            for (const deptName of depts) {
              const deptRes = await db.getFirstAsync<{id: number}>('SELECT id FROM departments WHERE name = ?', [deptName.toUpperCase()]);
              if (!deptRes) continue;
              const deptId = deptRes.id;

              // Check if the course already exists for THIS department
              let courseRes = await db.getFirstAsync<{id: number}>('SELECT id FROM courses WHERE title = ? AND department_id = ?', [item.title, deptId]);
              let courseId;
              
              if (!courseRes) {
                const insertRes = await db.runAsync(
                  'INSERT INTO courses (department_id, course_code, title) VALUES (?, ?, ?)', 
                  [deptId, item.title, item.title]
                );
                courseId = insertRes.lastInsertRowId;
              } else {
                courseId = courseRes.id;
              }
              
              // Insert the weekly schedule
              await db.runAsync(
                'INSERT INTO course_schedules (course_id, day_of_week, start_time, end_time, location) VALUES (?, ?, ?, ?, ?)', 
                [courseId, item.day_of_week, item.start_time, item.end_time, item.location || '']
              );
            }
          }
          fetchAllSchedules();
          fetchSchedules();
          setExtractedInfo("Schedule extraction successful!");
        } else {
          setExtractedInfo("No events detected.");
        }
      } catch (e: any) {
        console.error('JSON Parse Error:', e, 'Raw Response:', response);
        setExtractedInfo("Error parsing AI data.");
      }
    } catch (e) {
      console.error(e);
      alert('Failed to extract information');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.tint || "#1E1E1E" }]}>
      {/* HEADER */}
      <Card style={[styles.hero, { backgroundColor: palette.accentSoft || "#FFF4D6", borderWidth: 1, borderColor: palette.accentSoft || "#FFF4D6" }]}>
        <ThemeText variant="headline" color="graydark">Calendar</ThemeText>
        <ThemeText variant="body2" color="grayMedium">Weekly schedule and today's events.</ThemeText>
      </Card>

      {/* TOP HALF: Weekly Calendar Grid */}
      <View style={[styles.topHalf, { backgroundColor: palette.graywhite || "#1E1E1E" }]}>
        <View style={styles.gridHeaderRow}>
          <View style={styles.timeColumnHeader} />
          {days.map(day => (
            <View key={day} style={styles.dayHeaderCell}>
              <ThemeText variant="body3" color="grayMedium">{day}</ThemeText>
            </View>
          ))}
        </View>

        <ScrollView style={styles.gridScroll} showsVerticalScrollIndicator={false}>
          {hours.map(hour => (
            <View key={hour} style={styles.gridRow}>
              <View style={styles.timeColumn}>
                <ThemeText variant="body3" color="grayMedium">{hour}</ThemeText>
              </View>
              {days.map((day, idx) => (
                <View
                  key={`${day}-${hour}`}
                  style={[
                    styles.gridCell,
                    {
                      borderColor: palette.tint,
                      borderRightWidth: idx === days.length - 1 ? 0 : 1
                    }
                  ]}
                >
                {/* Show course image if a class exists for this day and hour */}
                <Image
                  source={{
                    uri: (() => {
                      const dayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5 };
                      const dayIndex = dayMap[`${day}`];
                      const ev = allSchedules.find(
                        (e) => e.day === dayIndex && e.time === `${hour}`
                      );
                      return ev
                        ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${ev.id}.png`
                        : ``;
                    })()
                  }}
                  style={styles.image}
                />
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>

      {/* BOTTOM HALF: Today's Events */}
      <View style={[styles.bottomHalf, { backgroundColor: palette.tint || "#121212" }]}>
        <View style={styles.bottomHeader}>
          <ThemeText variant="headline" color="graywhite">Today's events</ThemeText>
          <FilterButton deptValue={deptFilter} dayValue={dayFilter} onDeptChange={setDeptFilter} onDayChange={setDayFilter} />
        </View>

        <ScrollView contentContainerStyle={styles.eventsList} showsVerticalScrollIndicator={false}>
          {scheduleEvents.map((ev, idx) => {
            const eventContent = (
              <View style={[styles.eventItem, { backgroundColor: palette.graywhite || "#1E1E1E" }]}>
                <View style={styles.eventTimeContainer}>
                  <ThemeText variant="subtitle2" color="graydark">{ev.time}</ThemeText>
                </View>
                <View style={[styles.eventDetailsContainer, { borderLeftColor: palette.tint || "#DC0A2D" }]}>
                  <ThemeText variant="subtitle2" color="graydark">{ev.title}</ThemeText>
                  <ThemeText variant="body3" color="grayMedium">
                    {ev.location ? `Room: ${ev.location}` : 'Scheduled activity'}
                  </ThemeText>

                  {ev.id && (
                    <Image
                      source={{ uri: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${ev.id}.png` }}
                      style={styles.image}
                    />
                  )}
                </View>
              </View>
            );

            if (ev.type === 'course') {
              return (
                <CourseScheduleEditor
                  key={idx}
                  initialData={{
                    schedule_id: ev.schedule_id,
                    day_of_week: ev.day,
                    start_time: ev.time,
                    end_time: ev.end_time,
                    location: ev.location,
                  }}
                  onSave={handleSaveSchedule}
                  onDelete={handleDeleteSchedule}
                >
                  {eventContent}
                </CourseScheduleEditor>
              );
            }

            return <React.Fragment key={idx}>{eventContent}</React.Fragment>;
          })}
          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={palette.tint || "#DC0A2D"} />
              <ThemeText variant="body3" color="grayMedium" style={{ marginTop: 8 }}>Analyzing schedule...</ThemeText>
            </View>
          )}
        </ScrollView>
      </View>

      {/* FLOATING ACTION BUTTONS */}
      
      {/* LEFT FAB: Add a slot manually */}
      <CourseScheduleEditor
        initialData={{
          day_of_week: new Date().getDay() === 0 || new Date().getDay() === 6 ? 1 : new Date().getDay(),
          start_time: '08:00',
          end_time: '09:15',
          location: ''
        }}
        onSave={handleCreateSlot}
      >
        <View style={[styles.fab, styles.fabLeft, { backgroundColor: palette.grayMedium }]}>
          <ThemeText variant="headline" style={styles.fabText}>+</ThemeText>
        </View>
      </CourseScheduleEditor>

      {/* RIGHT FAB: Scan image with AI */}
      <TouchableOpacity
        style={[styles.fab, styles.fabRight, { backgroundColor: palette.grayMedium || "#DC0A2D" }]}
        onPress={handlePickAndExtract}
        activeOpacity={0.8}
      >
        <ThemeText variant="headline" style={styles.fabText}>📸</ThemeText>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  hero: { borderRadius: 18, padding: 14, marginHorizontal: 12, marginBottom: 8 },
  topHalf: {
    flex: 0.45,
    paddingTop: 16,
    paddingHorizontal: 16,
    marginHorizontal: 19,
    borderRadius: 24, 
    zIndex: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  bottomHalf: {
    flex: 0.55,
    paddingTop: 24,
    paddingHorizontal: 19,
  },
  gridHeaderRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  timeColumnHeader: {
    width: 45,
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: 'center',
  },
  gridScroll: {
    flex: 1,
  },
  gridRow: {
    flexDirection: 'row',
    height: 48,
    alignItems: 'center',
  },
  timeColumn: {
    width: 45,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    paddingTop: -6,
    
  },
  gridCell: {
    flex: 1,
    height: '100%',
    borderTopWidth: 1,
    borderRightWidth: 1,
    opacity: 0.5,
  },
  bottomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  eventsList: {
    paddingBottom: 100, // padding for FAB
  },
  eventItem: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  eventTimeContainer: {
    width: 65,
    justifyContent: 'center',
  },
  eventDetailsContainer: {
    flex: 1,
    borderLeftWidth: 3,
    paddingLeft: 12,
    justifyContent: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#DC0A2D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 10,
  },
  fabLeft: {
    left: 24,
  },
  fabRight: {
    right: 24,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 34,
    marginTop: -2,
  },
  image: { width: 40, height: 40, position: "absolute", right: 10,justifyContent: 'center', alignItems: 'center', },
});
