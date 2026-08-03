// Phase 4 (roadmap v1), Dashboard widgets (2026-08-03) — `react-grid-layout` est volontairement
// figé en v1.5.4 (voir DashboardWidgetGrid.tsx : l'API classique `GridLayout`/`WidthProvider`,
// stable et documentée depuis des années, contre l'API v2.x entièrement réécrite — hooks,
// `useGridLayout`, plus de `WidthProvider` — trop peu répandue/documentée pour la choisir dans un
// environnement où le rendu réel ne peut pas être vérifié visuellement avant livraison). Le paquet
// v1.5.4 fournit ses types en Flow, pas en TypeScript (`@types/react-grid-layout` n'est qu'un stub
// vide qui suppose la v2) — ce fichier ne déclare donc que le sous-ensemble de l'API réellement
// utilisé par ce projet, pas la surface complète de la librairie.
declare module 'react-grid-layout' {
  import type { ComponentType, ReactNode } from 'react'

  export interface Layout {
    i: string
    x: number
    y: number
    w: number
    h: number
    static?: boolean
  }

  export interface ReactGridLayoutProps {
    className?: string
    layout?: Layout[]
    cols?: number
    rowHeight?: number
    width?: number
    margin?: [number, number]
    containerPadding?: [number, number]
    isDraggable?: boolean
    isResizable?: boolean
    draggableHandle?: string
    onDragStop?: (
      layout: Layout[],
      oldItem: Layout,
      newItem: Layout,
      placeholder: Layout,
      event: Event,
      element: HTMLElement
    ) => void
    onLayoutChange?: (layout: Layout[]) => void
    children?: ReactNode
  }

  const GridLayout: ComponentType<ReactGridLayoutProps>
  export default GridLayout

  export function WidthProvider<P extends { width?: number }>(
    component: ComponentType<P>
  ): ComponentType<Omit<P, 'width'>>
}
