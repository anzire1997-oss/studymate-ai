import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type DeptFilter } from "@/components/FilterButton";

type SettingsContextValue = {
  defaultDept: DeptFilter;
  setDefaultDept: (dept: DeptFilter) => void;
  isLoading: boolean;
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [defaultDept, setDefaultDeptState] = useState<DeptFilter>("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('defaultDept').then((val) => {
      if (val) {
        setDefaultDeptState(val as DeptFilter);
      }
      setIsLoading(false);
    }).catch((e) => {
      console.error("Error loading settings:", e);
      setIsLoading(false);
    });
  }, []);

  const setDefaultDept = async (dept: DeptFilter) => {
    setDefaultDeptState(dept);
    try {
      await AsyncStorage.setItem('defaultDept', dept);
    } catch (e) {
      console.error("Error saving settings:", e);
    }
  };

  return (
    <SettingsContext.Provider value={{ defaultDept, setDefaultDept, isLoading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return context;
}
