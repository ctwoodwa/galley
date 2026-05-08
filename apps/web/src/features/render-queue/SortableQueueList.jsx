import { useCallback, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

/**
 * Wraps a list of queue items with dnd-kit drag-to-reorder. POSTs the new
 * qid order to the supplied `reorderEndpoint` after each drop; on failure,
 * the local state reverts on the next /api/queue refresh.
 *
 *   <SortableQueueList
 *     items={queue.queue}
 *     reorderEndpoint="/api/queue/order"
 *     renderItem={(item, dragHandleProps) => <QueueRow ... />}
 *   />
 */
export function SortableQueueList({ items, reorderEndpoint, renderItem }) {
  const [orderOverride, setOrderOverride] = useState(null)

  const effectiveItems = orderOverride
    ? orderOverride.map(qid => items.find(i => i.queue_id === qid)).filter(Boolean)
    : items

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = useCallback(
    async (event) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const ids = effectiveItems.map(i => i.queue_id)
      const oldIdx = ids.indexOf(active.id)
      const newIdx = ids.indexOf(over.id)
      if (oldIdx < 0 || newIdx < 0) return
      const newOrder = arrayMove(ids, oldIdx, newIdx)
      setOrderOverride(newOrder)
      try {
        await fetch(reorderEndpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: newOrder }),
        })
        // Server broadcasts queue-updated; the panel will pick up the canonical order
        // and clear our override on next render via the items-prop change.
      } catch {
        // Revert on failure
        setOrderOverride(null)
      }
    },
    [effectiveItems, reorderEndpoint],
  )

  // When `items` prop changes (server pushed a fresh queue), drop the override.
  // useEffect would be classic; deriving via comparing length + first id is cheaper
  // and runs on every render — fine for a small list.
  if (orderOverride && items.length !== orderOverride.length) {
    setOrderOverride(null)
  }

  const ids = effectiveItems.map(i => i.queue_id)

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {effectiveItems.map(item => (
          <SortableRow key={item.queue_id} id={item.queue_id}>
            {(handleProps) => renderItem(item, handleProps)}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children({ ...listeners })}
    </div>
  )
}
