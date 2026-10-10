import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type Modifier,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

// Arrastar e soltar da Minha planilha (lista e quadro), com dnd-kit.

/**
 * Mouse começa a arrastar depois de 4 px (um clique continua sendo clique); no
 * toque, segurando por 250 ms (assim a página ainda rola com o dedo); teclado
 * com espaço/Enter e as setas.
 */
export function useSheetSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/** Só na vertical (a lista não anda para os lados). */
export const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "Para mover um trabalho, pressione espaço ou Enter, use as setas e pressione espaço ou Enter de novo para soltar. Esc cancela.",
};

/** Avisos para leitores de tela, com o rótulo de cada trabalho (ex.: "#2559"). */
export function sheetAccessibility(label: (id: UniqueIdentifier) => string) {
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Pegou o trabalho ${label(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${label(active.id)} está sobre ${label(over.id)}.` : `${label(active.id)} está fora da lista.`,
    onDragEnd: ({ active, over }) =>
      over ? `${label(active.id)} foi solto sobre ${label(over.id)}.` : `${label(active.id)} foi solto fora da lista.`,
    onDragCancel: ({ active }) => `Movimento de ${label(active.id)} cancelado.`,
  };
  return { announcements, screenReaderInstructions };
}
