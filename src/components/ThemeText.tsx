import { Colors } from "@/constants/Colors";
import { useThemeColors } from "@/hooks/useThemeColors";
import { StyleSheet, Text, TextProps } from "react-native";

const styles = StyleSheet.create({
    headline:{
        fontSize: 24,
        lineHeight: 32,
        fontWeight: "bold",    
    },
    
    caption:{
        fontSize: 8,
        lineHeight: 12,
        fontWeight: "regular",    
    },

    subtitle1:{
        fontSize: 14,
        lineHeight: 16,
        fontWeight: "bold",    
    },

    subtitle2:{
        fontSize: 12,
        lineHeight: 16,
        fontWeight: "bold",    
    },

    subtitle3:{
        fontSize: 10,
        lineHeight: 16,
        fontWeight: "bold",    
    },

    subtitle4:{
        fontSize: 14,
        lineHeight: 16,
        fontWeight: "bold",    
    },
    
    subtitle5:{
        fontSize: 10,
        lineHeight: 16,
        fontWeight: "bold",    
    },
    
    body1:{
        fontSize: 14,
        lineHeight: 16,
        fontWeight: "regular",    
    },

    body2:{
        fontSize: 12,
        lineHeight: 16,
        fontWeight: "regular",    
    },
    
    body3:{
        fontSize: 10,
        lineHeight: 16,
        fontWeight: "regular",    
    },
})

type Props = TextProps &{
    variant?: keyof typeof styles,
    color?: keyof typeof Colors["light"],
}
export function ThemeText({variant, color, style, ...rest}: Props) {
    const colors = useThemeColors()
    return (
        <Text style={[styles[variant ?? 'body3'], {color: colors[color ?? "graydark"]}, style ]} {...rest}/>   
    );
}

