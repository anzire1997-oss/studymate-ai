import { View, ViewProps, ViewStyle } from "react-native";

type Props = ViewProps & {
    gap?: number;
}
export function Row({ style, gap, ...rest }: Props) {
    return (
        <View style={[rowstyle, style, gap ? {gap : gap }: undefined]} {...rest} />
    );
}  

const rowstyle = {
    flex: 0,
    flexDirection: "row",
    alignItems: "center"
    
} satisfies ViewStyle;  