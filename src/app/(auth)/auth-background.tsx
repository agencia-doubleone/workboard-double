"use client";

import dynamic from "next/dynamic";

// O ogl (WebGL) vai num chunk separado: o formulário hidrata sem esperar o fundo.
const PatternWaves = dynamic(() => import("@/components/pattern-waves"), { ssr: false });

/**
 * Fundo animado das telas públicas: pontos brancos em ondas sobre o preto da
 * página (.auth-backdrop), como as partículas do site da Double One. O centro,
 * atrás do formulário, fica calmo (fade="center"). O cursor deixa um rastro de
 * ondas e o clique faz um respingo.
 */
export function AuthBackground() {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10">
      <PatternWaves
        preset="silk"
        color="#ffffff"
        backgroundColor="transparent"
        opacity={0.7}
        fade="center"
        fadeSize={0.6}
        cursorSize={50}
        cursorStrength={0.6}
      />
    </div>
  );
}
