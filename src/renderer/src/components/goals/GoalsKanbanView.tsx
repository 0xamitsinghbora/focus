import { useCallback, useMemo } from 'react'
import { DailyGoal } from '../../../../shared/types'
import { cn } from '../../lib/utils'
import { GroupColorId } from '../../lib/groupTheme'
import { EmptyState } from '../DashboardLayout'
import { AddTaskCard } from '../AddTaskCard'
import { GoalCard } from './GoalCard'
import { GoalGroupSection } from './GoalGroupSection'
import { GoalsContextProvider, GoalsContextType, useGoalsContext } from './GoalsContext'
import {
  COLUMNS,
  ColumnId,
  DragState,
  HoverTarget,
  GroupHoverTarget,
  ColumnGroup,
  partitionColumnGroups
} from './types'
import { GoalsGroupTransferBanner, GoalsEmptyGroupDropZones } from './GoalsDragDropManager'
import type { ExistingGroup } from './hooks/useGoalsOrganize'

export interface GoalsKanbanViewProps {
  processedGoalsByColumn: Record<ColumnId, DailyGoal[]>
  collapsedCols: Record<ColumnId, boolean>
  toggleCollapse: (colId: ColumnId) => void
  openAddForm: (targetCol?: 'planned' | 'in_progress') => void
  showAddCol: 'planned' | 'in_progress' | null
  setShowAddCol: React.Dispatch<React.SetStateAction<'planned' | 'in_progress' | null>>
  onAddDailyGoal: (
    title: string,
    targetMinutes?: number,
    deadline?: string,
    note?: string,
    remindAt?: string,
    repeat?: string,
    groupTag?: string,
    groupColor?: string,
    status?: DailyGoal['status']
  ) => Promise<void>
  triggerAdd?: number
  shortcutLabel: string
  isMac: boolean
  registerColumn: (column: ColumnId) => (el: HTMLElement | null) => void
  isValidTarget: (col: ColumnId) => boolean
  isHovering: (col: ColumnId) => boolean
  collapsedGroups: Record<string, boolean>
  toggleCollapseGroup: (groupKey: string) => void
  inlineEditingGroup: { originalTag: string; currentTag: string; isUntagged?: boolean } | null
  setInlineEditingGroup: React.Dispatch<
    React.SetStateAction<{ originalTag: string; currentTag: string; isUntagged?: boolean } | null>
  >
  handleInlineRenameConfirm: () => Promise<void>
  announcement?: string | null
  setActiveGroupColorPicker?: (picker: { groupTag: string; x: number; y: number } | null) => void
  setActiveGroupMenu?: (
    menu: {
      groupTag: string
      sourceCol: ColumnId
      goals: DailyGoal[]
      isUntagged?: boolean
      x: number
      y: number
    } | null
  ) => void
  setEditGroupModal?: (
    modal: {
      groupTag: string
      newTag: string
      color: GroupColorId
      taskCount: number
      isUntagged?: boolean
      isNewGroup?: boolean
    } | null
  ) => void

  // Optional overrides (consumed from GoalsContext when wrapped)
  dailyGoals?: DailyGoal[]
  groupByTag?: boolean
  existingGroups?: ExistingGroup[]
  dayCutoffHour?: number
  drag?: DragState | null
  hoverColumn?: ColumnId | null
  hoverTarget?: HoverTarget | null
  hoverGroupTarget?: GroupHoverTarget | null
  selectedGoalIds?: Set<string>
  activeGoalId?: string | null
  setActiveGoalId?: (id: string | null) => void
  editingId?: string | null
  goalLoggedMinutesMap?: Record<string, number>
  onPointerDownCard?: (e: React.PointerEvent, goal: DailyGoal, sourceCol: ColumnId) => void
  onPointerDownGroup?: (
    e: React.PointerEvent,
    groupTag: string,
    groupGoals: DailyGoal[],
    sourceCol: ColumnId,
    color?: string,
    isUntagged?: boolean
  ) => void
  toggleSelectGoal?: (goalId: string, isShift: boolean, isSpace: boolean) => void
  selectSingle?: (goalId: string) => void
  startEdit?: (goal: DailyGoal) => void
  handleSaveEdit?: (
    goal: DailyGoal,
    data: {
      title: string
      note?: string
      deadline?: string
      remindAt?: string
      repeat?: string
      groupTag?: string
      groupColor?: string
      targetMinutes?: number
    }
  ) => Promise<void>
  cancelEdit?: () => void
  setContextMenu?: (menu: { goal: DailyGoal; x: number; y: number } | null) => void
  isGoalFocused?: (id: string) => boolean
  startFocus?: (goal: DailyGoal) => void
  togglePause?: () => void
  moveGoal?: (goal: DailyGoal, newStatus: DailyGoal['status']) => Promise<void>
  onCarryToToday?: (goal: DailyGoal) => Promise<void>
  onRescheduleGoal?: (goal: DailyGoal, deadline?: string) => Promise<void>
  longPressTriggeredRef?: React.MutableRefObject<boolean>
  didDragOccurRef?: React.MutableRefObject<boolean>
}

const EMPTY_GOALS: DailyGoal[] = []
const EMPTY_GROUPS: ExistingGroup[] = []
const EMPTY_SET = new Set<string>()
const EMPTY_MAP: Record<string, number> = {}
const NOOP = (): void => {}
const ASYNC_NOOP = async (): Promise<void> => {}
const FALSE_PREDICATE = (): boolean => false

export function GoalsKanbanView(props: GoalsKanbanViewProps): React.JSX.Element {
  const parentCtx = useGoalsContext()

  const dailyGoals = props.dailyGoals ?? parentCtx?.dailyGoals ?? EMPTY_GOALS
  const groupByTag = props.groupByTag ?? parentCtx?.groupByTag ?? false
  const existingGroups = props.existingGroups ?? parentCtx?.existingGroups ?? EMPTY_GROUPS
  const dayCutoffHour = props.dayCutoffHour ?? parentCtx?.dayCutoffHour ?? 0
  const drag = props.drag !== undefined ? props.drag : (parentCtx?.drag ?? null)
  const hoverColumn =
    props.hoverColumn !== undefined ? props.hoverColumn : (parentCtx?.hoverColumn ?? null)
  const hoverTarget =
    props.hoverTarget !== undefined ? props.hoverTarget : (parentCtx?.hoverTarget ?? null)
  const hoverGroupTarget =
    props.hoverGroupTarget !== undefined
      ? props.hoverGroupTarget
      : (parentCtx?.hoverGroupTarget ?? null)
  const selectedGoalIds = props.selectedGoalIds ?? parentCtx?.selectedGoalIds ?? EMPTY_SET
  const activeGoalId =
    props.activeGoalId !== undefined ? props.activeGoalId : (parentCtx?.activeGoalId ?? null)
  const setActiveGoalId = props.setActiveGoalId ?? parentCtx?.setActiveGoalId ?? NOOP
  const editingId = props.editingId !== undefined ? props.editingId : (parentCtx?.editingId ?? null)
  const goalLoggedMinutesMap =
    props.goalLoggedMinutesMap ?? parentCtx?.goalLoggedMinutesMap ?? EMPTY_MAP
  const onPointerDownCard = props.onPointerDownCard ?? parentCtx?.onPointerDownCard ?? NOOP
  const onPointerDownGroup = props.onPointerDownGroup ?? parentCtx?.onPointerDownGroup ?? NOOP
  const toggleSelectGoal = props.toggleSelectGoal ?? parentCtx?.toggleSelectGoal ?? NOOP
  const selectSingle = props.selectSingle ?? parentCtx?.selectSingle
  const startEdit = props.startEdit ?? parentCtx?.startEdit ?? NOOP
  const handleSaveEdit = props.handleSaveEdit ?? parentCtx?.handleSaveEdit ?? ASYNC_NOOP
  const cancelEdit = props.cancelEdit ?? parentCtx?.cancelEdit ?? NOOP
  const setContextMenu = props.setContextMenu ?? parentCtx?.setContextMenu ?? NOOP
  const isGoalFocused = props.isGoalFocused ?? parentCtx?.isGoalFocused ?? FALSE_PREDICATE
  const startFocus = props.startFocus ?? parentCtx?.startFocus ?? NOOP
  const togglePause = props.togglePause ?? parentCtx?.togglePause ?? NOOP
  const moveGoal = props.moveGoal ?? parentCtx?.moveGoal ?? ASYNC_NOOP
  const onCarryToToday = props.onCarryToToday ?? parentCtx?.onCarryToToday
  const onRescheduleGoal = props.onRescheduleGoal ?? parentCtx?.onRescheduleGoal
  const longPressTriggeredRef = props.longPressTriggeredRef ?? parentCtx?.longPressTriggeredRef
  const didDragOccurRef = props.didDragOccurRef ?? parentCtx?.didDragOccurRef

  const {
    processedGoalsByColumn,
    collapsedCols,
    toggleCollapse,
    openAddForm,
    showAddCol,
    setShowAddCol,
    onAddDailyGoal,
    triggerAdd,
    shortcutLabel,
    isMac,
    registerColumn,
    isValidTarget,
    isHovering,
    collapsedGroups,
    toggleCollapseGroup,
    inlineEditingGroup,
    setInlineEditingGroup,
    handleInlineRenameConfirm,
    announcement,
    setActiveGroupColorPicker = NOOP,
    setActiveGroupMenu = NOOP,
    setEditGroupModal = NOOP
  } = props
  const handleOpenColorPicker = useCallback(
    (groupTag: string, x: number, y: number) => {
      setActiveGroupColorPicker({ groupTag, x, y })
    },
    [setActiveGroupColorPicker]
  )

  const handleOpenEditGroupModal = useCallback(
    (modal: Parameters<typeof setEditGroupModal>[0]) => {
      setEditGroupModal(modal)
    },
    [setEditGroupModal]
  )

  const contextValue = useMemo<GoalsContextType>(
    () => ({
      dailyGoals,
      selectedGoalIds,
      activeGoalId,
      editingId,
      goalLoggedMinutesMap,
      groupByTag,
      existingGroups,
      dayCutoffHour,
      drag,
      hoverColumn,
      hoverTarget,
      hoverGroupTarget,
      onPointerDownCard,
      onPointerDownGroup,
      setActiveGoalId,
      toggleSelectGoal,
      selectSingle,
      startEdit,
      handleSaveEdit,
      cancelEdit,
      setContextMenu,
      isGoalFocused,
      startFocus,
      togglePause,
      moveGoal,
      onCarryToToday,
      onRescheduleGoal,
      longPressTriggeredRef,
      didDragOccurRef
    }),
    [
      dailyGoals,
      selectedGoalIds,
      activeGoalId,
      editingId,
      goalLoggedMinutesMap,
      groupByTag,
      existingGroups,
      dayCutoffHour,
      drag,
      hoverColumn,
      hoverTarget,
      hoverGroupTarget,
      onPointerDownCard,
      onPointerDownGroup,
      setActiveGoalId,
      toggleSelectGoal,
      selectSingle,
      startEdit,
      handleSaveEdit,
      cancelEdit,
      setContextMenu,
      isGoalFocused,
      startFocus,
      togglePause,
      moveGoal,
      onCarryToToday,
      onRescheduleGoal,
      longPressTriggeredRef,
      didDragOccurRef
    ]
  )

  const renderCard = useCallback(
    (goal: DailyGoal, col: ColumnId): React.JSX.Element => (
      <GoalCard key={goal.id} goal={goal} col={col} />
    ),
    []
  )

  const renderGroupSection = useCallback(
    (group: ColumnGroup, col: ColumnId): React.JSX.Element => (
      <GoalGroupSection
        key={group.tag}
        group={group}
        col={col}
        isCollapsed={Boolean(
          collapsedGroups[group.tag] ?? collapsedGroups[group.tag.toLowerCase()]
        )}
        onToggleCollapse={toggleCollapseGroup}
        dragActive={!!drag?.active}
        dragType={drag?.type ?? null}
        dragPayloadGroupTag={drag?.payload.groupTag}
        hoverTarget={hoverTarget}
        hoverGroupTarget={hoverGroupTarget}
        inlineEditingGroup={inlineEditingGroup}
        setInlineEditingGroup={setInlineEditingGroup}
        onInlineRenameConfirm={handleInlineRenameConfirm}
        onPointerDownGroup={onPointerDownGroup}
        onOpenColorPicker={handleOpenColorPicker}
        onOpenGroupMenu={setActiveGroupMenu}
        onOpenEditGroupModal={handleOpenEditGroupModal}
        dailyGoals={dailyGoals}
      >
        {group.goals.map((g) => renderCard(g, col))}
      </GoalGroupSection>
    ),
    [
      collapsedGroups,
      toggleCollapseGroup,
      drag,
      hoverTarget,
      hoverGroupTarget,
      inlineEditingGroup,
      setInlineEditingGroup,
      handleInlineRenameConfirm,
      onPointerDownGroup,
      handleOpenColorPicker,
      setActiveGroupMenu,
      handleOpenEditGroupModal,
      dailyGoals,
      renderCard
    ]
  )

  return (
    <GoalsContextProvider value={contextValue}>
      <div
        role="region"
        aria-label="Task board"
        className="flex gap-3 flex-1 min-h-0 w-full overflow-hidden"
      >
        {announcement && (
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {announcement}
          </div>
        )}
        {COLUMNS.map((col) => {
          const isCollapsed = Boolean(collapsedCols[col.id])
          const goals = processedGoalsByColumn[col.id] || []
          const columnGroups = groupByTag ? partitionColumnGroups(goals) : []
          const colShortcut =
            col.id === 'planned'
              ? isMac
                ? '⇧A'
                : 'Shift+A'
              : col.id === 'in_progress'
                ? isMac
                  ? '⇧S'
                  : 'Shift+S'
                : isMac
                  ? '⇧D'
                  : 'Shift+D'

          if (isCollapsed) {
            return (
              <div
                key={col.id}
                className="w-[46px] md:w-[50px] shrink-0 flex flex-col min-h-0 select-none transition-all duration-300 ease-in-out"
              >
                {/* Collapsed vertical ribbon acting as a drop surface */}
                <section
                  ref={registerColumn(col.id)}
                  data-column-surface="true"
                  data-column={col.id}
                  onClick={() => toggleCollapse(col.id)}
                  className={cn(
                    'flex-1 min-h-0 rounded-2xl border border-border/70 bg-surface/50 hover:bg-surface/85',
                    'flex flex-col items-center justify-between py-3 px-1 transition-all duration-200 cursor-pointer group shadow-2xs relative overflow-hidden select-none',
                    isHovering(col.id) &&
                      `bg-surface ring-2 ${col.hoverRing} border-transparent shadow-md`,
                    isValidTarget(col.id) && !isHovering(col.id) && 'border-dashed border-border/80'
                  )}
                  title={`Click to expand ${col.label} (${colShortcut})`}
                >
                  {/* Subtle status accent line on inner edge */}
                  <div
                    className={cn(
                      'absolute inset-y-0 w-1 opacity-60 group-hover:opacity-100 transition-opacity',
                      col.id === 'planned' ? 'left-0' : col.id === 'done' ? 'right-0' : 'left-0',
                      col.accent
                    )}
                  />

                  {/* Top: Expand button, accent dot, and count badge */}
                  <div className="flex flex-col items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleCollapse(col.id)
                      }}
                      className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/80 border border-transparent hover:border-border/60 transition-colors"
                      title={`Expand ${col.label} (${colShortcut})`}
                      aria-label={`Expand ${col.label}`}
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {col.id === 'done' ? (
                          <path d="m15 18-6-6 6-6" />
                        ) : (
                          <path d="m9 18 6-6-6-6" />
                        )}
                      </svg>
                    </button>

                    <div className={cn('h-2 w-2 rounded-full shadow-xs', col.accent)} />

                    {/* Task count badge */}
                    <span
                      className={cn(
                        'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold tabular-nums leading-none border shadow-2xs transition-colors select-none',
                        goals.length > 0
                          ? 'bg-secondary text-foreground border-border/80'
                          : 'bg-secondary/60 text-muted-foreground/80 border-border/50'
                      )}
                    >
                      {goals.length}
                    </span>
                  </div>

                  {/* Center: Vertical column label or animated drop indicator */}
                  <div className="flex-1 flex items-center justify-center py-4 my-auto">
                    {isHovering(col.id) ? (
                      <div className="flex flex-col items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
                        <div
                          className={cn(
                            'p-1.5 rounded-full ring-2 shadow-sm animate-bounce',
                            col.accent,
                            'text-white'
                          )}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="7 13 12 18 17 13" />
                            <line x1="12" y1="6" x2="12" y2="18" />
                          </svg>
                        </div>
                        <span
                          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                          className="text-[10.5px] font-bold text-foreground uppercase tracking-widest whitespace-nowrap"
                        >
                          Drop to {col.label}
                        </span>
                      </div>
                    ) : (
                      <span
                        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                        className="text-[12px] font-semibold text-muted-foreground group-hover:text-foreground transition-colors tracking-widest uppercase select-none"
                      >
                        {col.label}
                      </span>
                    )}
                  </div>

                  {/* Bottom: shortcut label */}
                  <div className="flex flex-col items-center gap-1 pb-1">
                    <span className="text-[9px] font-mono text-muted-foreground/60 select-none">
                      {colShortcut}
                    </span>
                  </div>
                </section>
              </div>
            )
          }

          return (
            <div
              key={col.id}
              className="flex-1 min-w-0 flex flex-col transition-all duration-300 ease-in-out"
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-1 pb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={cn('h-2 w-2 rounded-full shrink-0 shadow-xs', col.accent)}
                    aria-hidden="true"
                  />
                  <span className="text-[13px] font-semibold tracking-[-0.015em] text-foreground/90">
                    {col.label}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold tabular-nums leading-none border shadow-2xs transition-colors select-none',
                      goals.length > 0
                        ? 'bg-secondary text-foreground border-border/80'
                        : 'bg-secondary/60 text-muted-foreground/80 border-border/50'
                    )}
                  >
                    {goals.length}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {col.id === 'planned' && (
                    <button
                      type="button"
                      onClick={() => openAddForm('planned')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-2.5 py-1 text-[11.5px] font-medium tracking-[-0.01em] text-foreground hover:bg-secondary hover:border-border transition-colors shadow-2xs apple-press active:scale-[0.97] shrink-0 cursor-pointer"
                      title={`New Task (${shortcutLabel})`}
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-muted-foreground"
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      <span>New Task</span>
                      {shortcutLabel && (
                        <kbd className="hidden sm:inline px-1 py-0.2 rounded bg-secondary text-[10px] font-mono text-muted-foreground border border-border/60">
                          {shortcutLabel}
                        </kbd>
                      )}
                    </button>
                  )}

                  {/* Single Collapse / Expand Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleCollapse(col.id)
                    }}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/80 border border-border/60 hover:border-border transition-all shadow-2xs active:scale-95 cursor-pointer"
                    title={`Collapse ${col.label} (${colShortcut})`}
                    aria-label={`Collapse ${col.label}`}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {col.id === 'done' ? <path d="m9 18 6-6-6-6" /> : <path d="m15 18-6-6 6-6" />}
                    </svg>
                  </button>
                </div>
              </div>

              {/* Column drop surface */}
              <section
                ref={registerColumn(col.id)}
                data-column-surface="true"
                data-column={col.id}
                role="region"
                aria-label={`${col.label} column — ${goals.length} ${goals.length === 1 ? 'task' : 'tasks'}`}
                className={cn(
                  'rounded-2xl border border-border/60 bg-surface/50',
                  'flex-1 min-h-0 overflow-hidden flex flex-col p-2.5 transition-all duration-200',
                  isHovering(col.id) && `bg-surface ring-2 ${col.hoverRing}`,
                  isValidTarget(col.id) && !isHovering(col.id) && 'border-dashed border-border'
                )}
              >
                <div
                  className={cn(
                    'flex-1 overflow-y-auto space-y-2.5 custom-scrollbar pr-0.5',
                    selectedGoalIds.size > 0 ? 'pb-20' : 'pb-2'
                  )}
                >
                  {/* Whole-group transfer drop indicator banner */}
                  <GoalsGroupTransferBanner drag={drag} col={col} hoverColumn={hoverColumn} />

                  {/* Task creation form in Planned or In Progress column */}
                  {(col.id === 'planned' || col.id === 'in_progress') && showAddCol === col.id && (
                    <div className="mb-2 animate-in fade-in slide-in-from-top-1 duration-150">
                      <AddTaskCard
                        isExpanded={true}
                        existingGroups={existingGroups}
                        dayCutoffHour={dayCutoffHour}
                        onToggleExpand={(expanded) => {
                          if (!expanded) setShowAddCol(null)
                        }}
                        onCancel={() => setShowAddCol(null)}
                        triggerFocus={triggerAdd}
                        onAdd={async ({
                          title,
                          note,
                          deadline,
                          remindAt,
                          repeat,
                          groupTag,
                          groupColor,
                          targetMinutes
                        }) => {
                          await onAddDailyGoal(
                            title,
                            targetMinutes,
                            deadline,
                            note,
                            remindAt,
                            repeat,
                            groupTag,
                            groupColor,
                            col.id === 'in_progress' ? 'in_progress' : 'planned'
                          )
                          setShowAddCol(null)
                        }}
                      />
                    </div>
                  )}

                  {/* Empty state */}
                  {goals.length === 0 && showAddCol !== col.id ? (
                    <div className="flex flex-col items-center">
                      <EmptyState
                        title={
                          col.id === 'planned'
                            ? 'No planned tasks'
                            : col.id === 'in_progress'
                              ? 'Nothing in progress'
                              : 'No completed tasks yet'
                        }
                        description={
                          col.id === 'planned'
                            ? 'Queue up upcoming tasks to tackle later.'
                            : col.id === 'in_progress'
                              ? 'Active tasks for today will appear here.'
                              : 'Tasks you finish will be celebrated here.'
                        }
                        onClick={col.id === 'planned' ? () => openAddForm('planned') : undefined}
                        className={cn(
                          'min-h-[100px] border-0 bg-transparent py-4',
                          col.id === 'planned' &&
                            'cursor-pointer hover:bg-surface/30 rounded-xl transition-colors'
                        )}
                      />
                    </div>
                  ) : (
                    <>
                      {groupByTag
                        ? columnGroups.map((group) => renderGroupSection(group, col.id))
                        : goals.map((g) => renderCard(g, col.id))}
                    </>
                  )}

                  {/* Empty Groups in this column drop zones when dragging a card */}
                  {groupByTag && (
                    <GoalsEmptyGroupDropZones
                      colId={col.id}
                      drag={drag}
                      hoverTarget={hoverTarget}
                      existingGroups={existingGroups}
                      columnGroups={columnGroups}
                    />
                  )}
                </div>
              </section>
            </div>
          )
        })}
      </div>
    </GoalsContextProvider>
  )
}
