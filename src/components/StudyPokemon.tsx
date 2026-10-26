import { ThemeText } from "@/components/ThemeText";
import { Image, StyleSheet, View } from "react-native";
import { useEffect, useState } from "react";

type Props = {
  id: number;
  message: string;
  compact?: boolean;
};

type PokemonListEntry = { name: string; url: string };
type PokemonDetails = { name: string; sprites?: { front_default?: string | null } };

const FALLBACK = require("@/assets/images/Pokeball.png");

let pokemonListRequest: Promise<PokemonListEntry[]> | null = null;

function getPokemonList() {
  if (!pokemonListRequest) {
    pokemonListRequest = fetch("https://pokeapi.co/api/v2/pokemon?limit=151")
      .then((response) => {
        if (!response.ok) throw new Error("PokéAPI unavailable");
        return response.json() as Promise<{ results: PokemonListEntry[] }>;
      })
      .then(({ results }) => results);
  }
  return pokemonListRequest;
}

export function StudyPokemon({ id, message, compact = false }: Props) {
  const [pokemon, setPokemon] = useState<PokemonDetails | null>(null);

  useEffect(() => {
    let isMounted = true;
    const index = Math.abs(id) % 151;

    getPokemonList()
      .then((pokemonList) => fetch(pokemonList[index].url))
      .then((response) => {
        if (!response.ok) throw new Error("Pokémon details unavailable");
        return response.json() as Promise<PokemonDetails>;
      })
      .then((details) => {
        if (isMounted) setPokemon(details);
      })
      .catch(() => {
        if (isMounted) setPokemon(null);
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  const spriteUri = pokemon?.sprites?.front_default;
  const name = pokemon?.name ? `${pokemon.name.charAt(0).toUpperCase()}${pokemon.name.slice(1)}` : "Pokémon companion";

  if (compact) {
    return (
      <View style={styles.compactBadge} accessibilityLabel={`Pokémon companion: ${name}`}>
        <Image accessibilityLabel={name} source={spriteUri ? { uri: spriteUri } : FALLBACK} style={styles.compactSprite} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Image accessibilityLabel={name} source={spriteUri ? { uri: spriteUri } : FALLBACK} style={styles.sprite} />
      <View style={styles.bubble}>
        <ThemeText variant="subtitle3" color="graydark">{name}</ThemeText>
        <ThemeText variant="body3" color="grayMedium">{message}</ThemeText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  sprite: { width: 64, height: 64 },
  compactBadge: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.7)", alignItems: "center", justifyContent: "center" },
  compactSprite: { width: 84, height: 84 },
  bubble: { flex: 1, backgroundColor: "rgba(255,255,255,0.78)", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7 },
});
