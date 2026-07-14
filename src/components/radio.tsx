import { StyleSheet, View } from "react-native";
import { useThemeColors } from "@/hooks/useThemeColors";

type Props = {
    checked : boolean;
}

export const Radio = ({checked}:Props) => {
    const colors = useThemeColors();
    return (
        <View style={[styles.radio, {borderColor:colors.tint}]} >
           {checked ? (
            <View style={[styles.radioInner,{backgroundColor:colors.tint}]}></View>
           ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    radio: {
        width:14,
        height:14,
        borderStyle:"solid",
        borderRadius:14,
        borderWidth:1,
        justifyContent:"center",
        alignItems:"center",
    },
    radioInner:{
        width:6,
        height:6,
        borderRadius:6,
    }
    
})