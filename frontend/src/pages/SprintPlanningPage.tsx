import { useState } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { GanttView } from '../components/planning/GanttView'
import { ItemModal } from '../components/backlog/ItemModal'
import type { Item } from '../types'

export function SprintPlanningPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const [modalItem, setModalItem] = useState<Item | null | undefined>(undefined)

  function handleUpdateItem(item: Item) {
    dispatch({ type: 'UPDATE_ITEM', payload: item })
    saveToServer({ ...state, items: state.items.map(i => i.id === item.id ? item : i) })
  }

  function handleSave(item: Item) {
    const isNew = !state.items.find(i => i.id === item.id)
    dispatch({ type: isNew ? 'ADD_ITEM' : 'UPDATE_ITEM', payload: item })
    saveToServer({
      ...state,
      items: isNew
        ? [...state.items, item]
        : state.items.map(i => i.id === item.id ? item : i),
    })
    setModalItem(undefined)
  }

  return (
    <>
      <Header title="Sprint Planning" />
      <div className="page-content" style={{ padding: '24px 16px' }}>
        <GanttView
          state={state}
          onEdit={item => setModalItem(item)}
          onUpdateItem={handleUpdateItem}
        />
      </div>
      {modalItem !== undefined && (
        <ItemModal
          item={modalItem}
          state={state}
          onSave={handleSave}
          onClose={() => setModalItem(undefined)}
        />
      )}
    </>
  )
}
