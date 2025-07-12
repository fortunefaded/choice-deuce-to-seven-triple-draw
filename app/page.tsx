"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

type Position = "UTG" | "HJ" | "CO" | "BU" | "SB" | "BB"
type LearningPosition = "UTG" | "HJ" | "CO" | "BTN" | "SB" | "BB"

interface Player {
  id: string
  name: string
  chips: number
  cards: string[]
  position: Position
  isActive: boolean
  isDealer: boolean
}

interface HandCard {
  rank: string
  suit: string
  display: string
  value: number
}

// シンプル化されたHandRange
interface HandRange {
  includes: string[] // "8s+", "8654+"などの表記をサポート
  excludes: string[] // 除外ハンド
}

interface PositionStrategy {
  position: LearningPosition
  patHands: HandRange
  draw1Hands: HandRange
  draw2Hands: HandRange
  draw3Hands: HandRange
  draw4Hands: HandRange
  inheritsFrom?: LearningPosition
}

interface MistakeRecord {
  id: string
  hand: HandCard[]
  userAction: string
  correctAction: string
  category: string
  explanation: string
  timestamp: number
  position: LearningPosition
}

interface DrillModeState {
  isActive: boolean
  mistakePool: MistakeRecord[]
  currentMistakeIndex: number
  reviewStats: {
    totalReviewed: number
    correctOnReview: number
  }
}

interface GameState {
  pot: number
  currentBet: number
  drawsLeft: number
  phase: "learning" | "drill" | "strategy-management"
  currentHand: HandCard[]
  isPlayable: boolean
  showAnswer: boolean
  score: { correct: number; total: number }
  playerAction: string | null
  correctAction: string
  handCategory: string
  explanation: string
  ruleUsed: string
  benchmark?: string
  mistakes: MistakeRecord[]
  drillMode: DrillModeState
  difficultyWeights: {
    [key: string]: number
  }
  minimumRaiseExample?: string
}

// Better Hand表記を具体的なハンドリストに展開する関数を追加
const expandBetterHandNotation = (pattern: string): string[] => {
  const results: string[] = []

  // "8s+" -> Pat 8-high or better
  if (pattern.match(/^\d+s\+$/)) {
    const threshold = Number.parseInt(pattern.charAt(0))
    const patHands = []

    // Generate all possible pat hands at or below threshold
    for (let high = 2; high <= threshold; high++) {
      for (let second = 2; second < high; second++) {
        for (let third = 2; third < second; third++) {
          for (let fourth = 2; fourth < third; fourth++) {
            for (let fifth = 2; fifth < fourth; fifth++) {
              patHands.push(`${high}${second}${third}${fourth}${fifth}`)
            }
          }
        }
      }
    }
    return patHands.slice(0, 10) // 最初の10個を表示（表示制限）
  }

  // "8654+" -> Draw 1 8654 or better
  if (pattern.match(/^\d{4}\+$/)) {
    const benchmarkStr = pattern.slice(0, -1)
    const benchmark = benchmarkStr
      .split("")
      .map(Number)
      .sort((a, b) => a - b)
    const draw1Hands = []

    // Generate combinations that are 8654 or better
    for (let a = 2; a <= 9; a++) {
      for (let b = 2; b < a; b++) {
        for (let c = 2; c < b; c++) {
          for (let d = 2; d < c; d++) {
            const testHand = [a, b, c, d]
            if (compareLowballHands(testHand, benchmark) <= 0) {
              draw1Hands.push(`${a}${b}${c}${d}`)
            }
          }
        }
      }
    }
    return draw1Hands.slice(0, 15) // 最初の15個を表示
  }

  // "542+" -> Draw 2 542 or better
  if (pattern.match(/^\d{3}\+$/)) {
    const benchmarkStr = pattern.slice(0, -1)
    const benchmark = benchmarkStr
      .split("")
      .map(Number)
      .sort((a, b) => a - b)
    const draw2Hands = []

    // Generate 3-card combinations that are 542 or better
    for (let a = 2; a <= 9; a++) {
      for (let b = 2; b < a; b++) {
        for (let c = 2; c < b; c++) {
          const testHand = [a, b, c]
          if (compareLowballHands(testHand, benchmark) <= 0) {
            draw2Hands.push(`${a}${b}${c}`)
          }
        }
      }
    }
    return draw2Hands
  }

  // "6322+" -> specific pattern with pair requirement
  if (pattern.match(/^\d{4}\+$/) && pattern.includes("22")) {
    const basePattern = pattern.slice(0, -3) // "63" from "6322+"
    const pairCard = pattern.charAt(2) // "2" from "6322+"
    return [`${basePattern}${pairCard}(${pairCard})`]
  }

  return [pattern] // Return as-is if no pattern matches
}

// 内訳付きでHandRangeを表示する関数を追加
const formatHandRangeWithBreakdown = (range: HandRange, showBreakdown = false): string => {
  const parts = []

  if (range.includes.length > 0) {
    const includesParts = range.includes.map((item) => {
      if (showBreakdown && (item.includes("+") || item.match(/^\d+s\+$/) || item.match(/^\d{3,4}\+$/))) {
        const expanded = expandBetterHandNotation(item)
        if (expanded.length > 1) {
          return `${item}(${expanded.slice(0, 8).join(", ")}${expanded.length > 8 ? "..." : ""})`
        }
      }
      return item
    })
    parts.push(includesParts.join(", "))
  }

  if (range.excludes.length > 0) {
    parts.push(`except: ${range.excludes.join(", ")}`)
  }

  return parts.join(" | ") || "None"
}

const compareLowballHands = (hand1: number[], hand2: number[]): number => {
  const sorted1 = [...hand1].sort((a, b) => b - a)
  const sorted2 = [...hand2].sort((a, b) => b - a)
  for (let i = 0; i < sorted1.length; i++) {
    if (sorted1[i] !== sorted2[i]) return sorted1[i] - sorted2[i]
  }
  return 0
}

export default function UTGLearningApp() {
  const [players, setPlayers] = useState<Player[]>([
    {
      id: "6",
      name: "You",
      chips: 189.77,
      cards: [],
      position: "UTG",
      isActive: true,
      isDealer: false,
    },
    {
      id: "1",
      name: "Oregano",
      chips: 495.34,
      cards: ["back", "back", "back", "back", "back"],
      position: "HJ",
      isActive: false,
      isDealer: false,
    },
    {
      id: "2",
      name: "Paprika",
      chips: 443.09,
      cards: ["back", "back", "back", "back", "back"],
      position: "CO",
      isActive: false,
      isDealer: false,
    },
    {
      id: "3",
      name: "Basil",
      chips: 46.9,
      cards: ["back", "back", "back", "back", "back"],
      position: "BU",
      isActive: false,
      isDealer: true,
    },
    {
      id: "4",
      name: "Thyme",
      chips: 706.83,
      cards: ["back", "back", "back", "back", "back"],
      position: "SB",
      isActive: false,
      isDealer: false,
    },
    {
      id: "5",
      name: "Rosemary",
      chips: 324.56,
      cards: ["back", "back", "back", "back", "back"],
      position: "BB",
      isActive: false,
      isDealer: false,
    },
  ])

  // シンプル化された戦略定義
  const [positionStrategies, setPositionStrategies] = useState<PositionStrategy[]>([
    {
      position: "UTG",
      patHands: {
        includes: ["8s+"],
        excludes: [],
      },
      draw1Hands: {
        includes: ["8654+"],
        excludes: ["7654"],
      },
      draw2Hands: {
        includes: ["542+", "752+", "842+", "6322+", "7622+"],
        excludes: [],
      },
      draw3Hands: {
        includes: ["3222", "3322", "3332", "4222", "7222"],
        excludes: [],
      },
      draw4Hands: {
        includes: [],
        excludes: [],
      },
    },
    {
      position: "HJ",
      patHands: {
        includes: [],
        excludes: [],
      },
      draw1Hands: {
        includes: ["8753", "8754"],
        excludes: [],
      },
      draw2Hands: {
        includes: ["762", "852", "753", "6322", "8722"],
        excludes: [],
      },
      draw3Hands: {
        includes: ["3222", "3322", "4422", "5222", "7722"],
        excludes: [],
      },
      draw4Hands: {
        includes: [],
        excludes: [],
      },
      inheritsFrom: "UTG",
    },
    {
      position: "CO",
      patHands: {
        includes: ["96543", "97654"],
        excludes: [],
      },
      draw1Hands: {
        includes: [],
        excludes: [],
      },
      draw2Hands: {
        includes: ["632", "754", "854", "872"],
        excludes: [],
      },
      draw3Hands: {
        includes: ["32", "42", "72", "522"],
        excludes: [],
      },
      draw4Hands: {
        includes: [],
        excludes: [],
      },
      inheritsFrom: "HJ",
    },
    {
      position: "BTN",
      patHands: {
        includes: ["T9875", "T8765", "T7654", "T6543"],
        excludes: [],
      },
      draw1Hands: {
        includes: ["all"],
        excludes: [],
      },
      draw2Hands: {
        includes: ["all"],
        excludes: ["654", "765", "876"],
      },
      draw3Hands: {
        includes: ["52", "622", "822"],
        excludes: [],
      },
      draw4Hands: {
        includes: ["22"],
        excludes: [],
      },
      inheritsFrom: "CO",
    },
    {
      position: "SB",
      patHands: {
        includes: [],
        excludes: [],
      },
      draw1Hands: {
        includes: [],
        excludes: [],
      },
      draw2Hands: {
        includes: ["limp/raise strategy"],
        excludes: [],
      },
      draw3Hands: {
        includes: ["limp/raise strategy"],
        excludes: [],
      },
      draw4Hands: {
        includes: ["limp 2", "33-55"],
        excludes: [],
      },
      inheritsFrom: "BTN",
    },
    {
      position: "BB",
      patHands: {
        includes: [],
        excludes: [],
      },
      draw1Hands: {
        includes: [],
        excludes: [],
      },
      draw2Hands: {
        includes: ["vs SB limp: any d2"],
        excludes: [],
      },
      draw3Hands: {
        includes: ["vs SB limp: 63+"],
        excludes: [],
      },
      draw4Hands: {
        includes: [],
        excludes: [],
      },
      inheritsFrom: "SB",
    },
  ])

  const [gameState, setGameState] = useState<GameState>({
    pot: 34.2,
    currentBet: 34.2,
    drawsLeft: 3,
    phase: "learning",
    currentHand: [],
    isPlayable: false,
    showAnswer: false,
    score: { correct: 0, total: 0 },
    playerAction: null,
    correctAction: "fold",
    handCategory: "",
    explanation: "",
    ruleUsed: "",
    benchmark: undefined,
    mistakes: [],
    drillMode: {
      isActive: false,
      mistakePool: [],
      currentMistakeIndex: 0,
      reviewStats: {
        totalReviewed: 0,
        correctOnReview: 0,
      },
    },
    difficultyWeights: {},
    minimumRaiseExample: undefined,
  })

  const playerPositions = [
    { bottom: "8%", left: "50%", transform: "translateX(-50%)" },
    { bottom: "25%", left: "15%" },
    { top: "25%", left: "15%" },
    { top: "8%", left: "50%", transform: "translateX(-50%)" },
    { top: "25%", right: "15%" },
    { bottom: "25%", right: "15%" },
  ]

  // 古い形式から新しい形式への変換ヘルパー関数
  const convertLegacyHandRange = (legacyData: any): HandRange => {
    // 既に新しい形式の場合
    if (legacyData && typeof legacyData === "object" && Array.isArray(legacyData.includes)) {
      return {
        includes: legacyData.includes || [],
        excludes: legacyData.excludes || [],
      }
    }

    // 古い形式（string[]）の場合
    if (Array.isArray(legacyData)) {
      return {
        includes: legacyData,
        excludes: [],
      }
    }

    // デフォルト
    return {
      includes: [],
      excludes: [],
    }
  }

  // Better hand表記の解釈関数
  const interpretBetterHand = (pattern: string, testHand: number[]): boolean => {
    // "8s+" -> Pat 8-high or better
    if (pattern.match(/^\d+s\+$/)) {
      const threshold = Number.parseInt(pattern.charAt(0))
      const highCard = Math.max(...testHand)
      return highCard <= threshold
    }

    // "8654+" -> Draw 1 8654 or better
    if (pattern.match(/^\d{4}\+$/)) {
      const benchmarkStr = pattern.slice(0, -1)
      const benchmark = benchmarkStr
        .split("")
        .map(Number)
        .sort((a, b) => a - b)
      return compareLowballHands(testHand, benchmark) <= 0
    }

    // "542+" -> Draw 2 542 or better
    if (pattern.match(/^\d{3}\+$/)) {
      const benchmarkStr = pattern.slice(0, -1)
      const benchmark = benchmarkStr
        .split("")
        .map(Number)
        .sort((a, b) => a - b)
      return compareLowballHands(testHand, benchmark) <= 0
    }

    // "6322+" -> specific pattern with pair requirement
    if (pattern.match(/^\d{4}\+$/) && pattern.includes("22")) {
      const basePattern = pattern.slice(0, -3) // "63" from "6322+"
      const pairCard = Number.parseInt(pattern.charAt(2)) // "2" from "6322+"
      return (
        testHand.includes(Number.parseInt(basePattern.charAt(0))) &&
        testHand.includes(Number.parseInt(basePattern.charAt(1))) &&
        testHand.filter((x) => x === pairCard).length >= 2
      )
    }

    return false
  }

  // 構造化された戦略を統合する関数
  const getFullStrategy = (position: LearningPosition): PositionStrategy => {
    const strategy = positionStrategies.find((s) => s.position === position)
    if (!strategy) return positionStrategies[0]

    if (!strategy.inheritsFrom) {
      return {
        ...strategy,
        patHands: convertLegacyHandRange(strategy.patHands),
        draw1Hands: convertLegacyHandRange(strategy.draw1Hands),
        draw2Hands: convertLegacyHandRange(strategy.draw2Hands),
        draw3Hands: convertLegacyHandRange(strategy.draw3Hands),
        draw4Hands: convertLegacyHandRange(strategy.draw4Hands),
      }
    }

    const parentStrategy = getFullStrategy(strategy.inheritsFrom)

    const currentPatHands = convertLegacyHandRange(strategy.patHands)
    const currentDraw1Hands = convertLegacyHandRange(strategy.draw1Hands)
    const currentDraw2Hands = convertLegacyHandRange(strategy.draw2Hands)
    const currentDraw3Hands = convertLegacyHandRange(strategy.draw3Hands)
    const currentDraw4Hands = convertLegacyHandRange(strategy.draw4Hands)

    return {
      ...strategy,
      patHands: {
        includes: [...parentStrategy.patHands.includes, ...currentPatHands.includes],
        excludes: [...parentStrategy.patHands.excludes, ...currentPatHands.excludes],
      },
      draw1Hands: {
        includes: [...parentStrategy.draw1Hands.includes, ...currentDraw1Hands.includes],
        excludes: [...parentStrategy.draw1Hands.excludes, ...currentDraw1Hands.excludes],
      },
      draw2Hands: {
        includes: [...parentStrategy.draw2Hands.includes, ...currentDraw2Hands.includes],
        excludes: [...parentStrategy.draw2Hands.excludes, ...currentDraw2Hands.excludes],
      },
      draw3Hands: {
        includes: [...parentStrategy.draw3Hands.includes, ...currentDraw3Hands.includes],
        excludes: [...parentStrategy.draw3Hands.excludes, ...currentDraw3Hands.excludes],
      },
      draw4Hands: {
        includes: [...parentStrategy.draw4Hands.includes, ...currentDraw4Hands.includes],
        excludes: [...parentStrategy.draw4Hands.excludes, ...currentDraw4Hands.excludes],
      },
    }
  }

  // HandRangeを文字列表現に変換
  const formatHandRange = (range: HandRange): string => {
    const parts = []
    if (range.includes.length > 0) parts.push(range.includes.join(", "))
    if (range.excludes.length > 0) parts.push(`except: ${range.excludes.join(", ")}`)
    return parts.join(" | ") || "None"
  }

  const generateRandomHand = (): HandCard[] => {
    const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T"]
    const suits = ["♠", "♥", "♦", "♣"]
    const hand: HandCard[] = []
    const usedCards = new Set<string>()
    const getValue = (rank: string): number => {
      if (rank === "A") return 14
      if (rank === "K") return 13
      if (rank === "Q") return 12
      if (rank === "J") return 11
      if (rank === "T") return 10
      return Number.parseInt(rank)
    }
    while (hand.length < 5) {
      const rank = ranks[Math.floor(Math.random() * ranks.length)]
      const suit = suits[Math.floor(Math.random() * suits.length)]
      const cardKey = `${rank}${suit}`
      if (!usedCards.has(cardKey)) {
        usedCards.add(cardKey)
        hand.push({ rank, suit, display: `${rank}${suit}`, value: getValue(rank) })
      }
    }
    return hand.sort((a, b) => b.value - a.value)
  }

  // シンプル化されたハンド評価
  const evaluateHandForPosition = (
    hand: HandCard[],
    position: LearningPosition,
  ): {
    isPlayable: boolean
    correctAction: string
    category: string
    explanation: string
    ruleUsed: string
    benchmark?: string
    minimumRaiseExample?: string
  } => {
    const values = hand.map((card) => card.value).sort((a, b) => a - b)
    const suits = hand.map((card) => card.suit)
    const valueCounts: { [key: number]: number } = values.reduce((acc, val) => {
      acc[val] = (acc[val] || 0) + 1
      return acc
    }, {})
    const hasPair = Object.values(valueCounts).some((count) => count > 1)
    const hasFlush = new Set(suits).size === 1
    const isStraight = (vals: number[]) => {
      if (vals.length < 5) return false
      const sorted = [...new Set(vals)].sort((a, b) => a - b)
      if (sorted.length < 5) return false
      for (let i = 0; i <= sorted.length - 5; i++) {
        const slice = sorted.slice(i, i + 5)
        let isSliceStraight = true
        for (let j = 0; j < slice.length - 1; j++) {
          if (slice[j + 1] !== slice[j] + 1) {
            isSliceStraight = false
            break
          }
        }
        if (isSliceStraight) return true
      }
      return false
    }
    const hasStraightInHand = isStraight(values)
    const hasWheel = values.toString() === "2,3,4,5,14"

    const strategy = getFullStrategy(position)
    const uniqueValues = Array.from(new Set(values)).sort((a, b) => a - b)

    // Pat hand evaluation
    if (!hasPair && !hasFlush && !hasStraightInHand && !hasWheel) {
      const highCard = values[4]

      // Check better hand patterns like "8s+"
      for (const pattern of strategy.patHands.includes) {
        if (interpretBetterHand(pattern, values)) {
          const isInherited = position !== "UTG"
          return {
            isPlayable: true,
            correctAction: "raise",
            category: `Pat ${highCard}-high`,
            explanation: `This pat hand meets the ${pattern} requirement. ${isInherited ? `Inherited from parent position.` : `Standard range.`}`,
            ruleUsed: isInherited ? `Inherited Pat Range (${pattern})` : `Pat Range (${pattern})`,
            benchmark: pattern,
          }
        }
      }
    }

    // Draw 1 evaluation
    let fourBestCards = null
    if (uniqueValues.length === 4) fourBestCards = uniqueValues
    else if (uniqueValues.length === 5) fourBestCards = uniqueValues.slice(0, 4)

    if (fourBestCards && !isStraight(fourBestCards)) {
      const draw1Strategy = strategy.draw1Hands

      // Check excludes first
      const handString = fourBestCards.join("")
      if (draw1Strategy.excludes.includes(handString) || draw1Strategy.excludes.includes("7654")) {
        if (handString === "4567") {
          return {
            isPlayable: false,
            correctAction: "fold",
            category: "Draw 1 Excluded (7654)",
            explanation: "7654 is specifically excluded from the Draw 1 range.",
            ruleUsed: `${position} Draw 1 Exclusion`,
            benchmark: "7654 excluded",
            minimumRaiseExample: getMinimumRaiseExample(position),
          }
        }
      }

      // Check better hand patterns
      for (const pattern of draw1Strategy.includes) {
        if (pattern === "all" || interpretBetterHand(pattern, fourBestCards)) {
          const isInherited = position !== "UTG"
          return {
            isPlayable: true,
            correctAction: "raise",
            category: `Draw 1 (${fourBestCards.join("")})`,
            explanation: `This draw 1 meets the ${pattern} requirement. ${isInherited ? `Inherited from parent position.` : `Standard range.`}`,
            ruleUsed: isInherited ? `Inherited Draw 1 (${pattern})` : `Draw 1 (${pattern})`,
            benchmark: pattern,
          }
        }
      }

      // Check specific hands
      if (draw1Strategy.includes.includes(fourBestCards.join(""))) {
        return {
          isPlayable: true,
          correctAction: "raise",
          category: `Draw 1 (${fourBestCards.join("")})`,
          explanation: `${fourBestCards.join("")} is specifically included in the ${position} range.`,
          ruleUsed: `${position} Draw 1 Specific`,
          benchmark: fourBestCards.join(""),
        }
      }
    }

    // Draw 2 evaluation
    if (values.includes(2)) {
      const draw2Strategy = strategy.draw2Hands
      const threeCardDraws = []
      if (uniqueValues.length >= 3) {
        const otherCards = uniqueValues.filter((v) => v !== 2)
        if (otherCards.length >= 2) threeCardDraws.push([2, otherCards[0], otherCards[1]])
      }

      for (const best3With2 of threeCardDraws) {
        if (!best3With2) continue

        // Check better hand patterns
        for (const pattern of draw2Strategy.includes) {
          if (interpretBetterHand(pattern, best3With2)) {
            const isInherited = position !== "UTG"
            return {
              isPlayable: true,
              correctAction: "raise",
              category: `Draw 2 (${best3With2.join("")})`,
              explanation: `This draw 2 meets the ${pattern} requirement. ${isInherited ? `Inherited from parent position.` : `Standard range.`}`,
              ruleUsed: isInherited ? `Inherited Draw 2 (${pattern})` : `Draw 2 (${pattern})`,
              benchmark: pattern,
            }
          }
        }
      }
    }

    return {
      isPlayable: false,
      correctAction: "fold",
      category: "Fold",
      explanation: `This hand does not meet the minimum requirements for ${position}.`,
      ruleUsed: `${position} Minimum Standards`,
      benchmark: `Below ${position} threshold`,
      minimumRaiseExample: getMinimumRaiseExample(position),
    }
  }

  const getMinimumRaiseExample = (position: LearningPosition): string => {
    const strategy = getFullStrategy(position)
    const examples = []

    if (strategy.patHands.includes.length > 0) examples.push(`Pat: ${strategy.patHands.includes[0]}`)
    if (strategy.draw1Hands.includes.length > 0) examples.push(`Draw1: ${strategy.draw1Hands.includes[0]}`)
    if (strategy.draw2Hands.includes.length > 0) examples.push(`Draw2: ${strategy.draw2Hands.includes[0]}`)

    return examples.join(", ") || "Minimum playable hand for this position"
  }

  const dealNewHand = () => {
    const availablePositions: LearningPosition[] = ["UTG", "HJ"]
    const newPlayerPosition = availablePositions[Math.floor(Math.random() * availablePositions.length)]

    const allPositions: Position[] = ["UTG", "HJ", "CO", "BU", "SB", "BB"]
    const startIdx = allPositions.indexOf(newPlayerPosition)

    const updatedPlayers = players.map((player, index) => {
      const currentPositionIndex = (startIdx + index) % 6
      const currentPosition = allPositions[currentPositionIndex]
      return {
        ...player,
        position: currentPosition,
        isDealer: false,
        isActive: index === 0,
        cards: index === 0 ? [] : ["back", "back", "back", "back", "back"],
      }
    })

    const buPlayerIndex = updatedPlayers.findIndex((p) => p.position === "BU")
    if (buPlayerIndex !== -1) {
      updatedPlayers[buPlayerIndex].isDealer = true
    }

    const newHand = generateRandomHand()
    const evaluation = evaluateHandForPosition(newHand, newPlayerPosition)

    setPlayers(updatedPlayers.map((p) => (p.id === "6" ? { ...p, cards: newHand.map((c) => c.display) } : p)))

    setGameState((prev) => ({
      ...prev,
      currentHand: newHand,
      isPlayable: evaluation.isPlayable,
      correctAction: evaluation.correctAction,
      handCategory: evaluation.category,
      explanation: evaluation.explanation,
      ruleUsed: evaluation.ruleUsed,
      benchmark: evaluation.benchmark,
      showAnswer: false,
      playerAction: null,
      minimumRaiseExample: evaluation.minimumRaiseExample,
    }))
  }

  const handlePlayerAction = (action: string) => {
    const isCorrect = action === gameState.correctAction
    const yourPosition = players.find((p) => p.id === "6")?.position as LearningPosition

    if (!isCorrect && gameState.phase === "learning") {
      const mistakeRecord: MistakeRecord = {
        id: `mistake_${Date.now()}`,
        hand: [...gameState.currentHand],
        userAction: action,
        correctAction: gameState.correctAction,
        category: gameState.handCategory,
        explanation: gameState.explanation,
        timestamp: Date.now(),
        position: yourPosition,
      }
      setGameState((prev) => ({
        ...prev,
        playerAction: action,
        showAnswer: true,
        score: { correct: prev.score.correct, total: prev.score.total + 1 },
        mistakes: [...prev.mistakes, mistakeRecord],
      }))
    } else {
      setGameState((prev) => ({
        ...prev,
        playerAction: action,
        showAnswer: true,
        score: { correct: prev.score.correct + (isCorrect ? 1 : 0), total: prev.score.total + 1 },
      }))
    }
  }

  const nextHand = () => dealNewHand()

  useEffect(() => {
    const savedStrategies = localStorage.getItem("pokerStrategies")
    if (savedStrategies) {
      try {
        const parsed = JSON.parse(savedStrategies)
        setPositionStrategies((current) => {
          const merged = [...current]
          parsed.forEach((savedStrategy: any) => {
            const existingIndex = merged.findIndex((s) => s.position === savedStrategy.position)
            if (existingIndex >= 0) {
              merged[existingIndex] = {
                ...merged[existingIndex],
                ...savedStrategy,
                patHands: convertLegacyHandRange(savedStrategy.patHands) || merged[existingIndex].patHands,
                draw1Hands: convertLegacyHandRange(savedStrategy.draw1Hands) || merged[existingIndex].draw1Hands,
                draw2Hands: convertLegacyHandRange(savedStrategy.draw2Hands) || merged[existingIndex].draw2Hands,
                draw3Hands: convertLegacyHandRange(savedStrategy.draw3Hands) || merged[existingIndex].draw3Hands,
                draw4Hands: convertLegacyHandRange(savedStrategy.draw4Hands) || merged[existingIndex].draw4Hands,
              }
            }
          })
          return merged
        })
      } catch (e) {
        console.error("Failed to load saved strategies")
      }
    }
    dealNewHand()
  }, [])

  const isCorrect = gameState.playerAction === gameState.correctAction
  const yourPosition = players.find((p) => p.id === "6")?.position || "UTG"
  const currentStrategy = getFullStrategy(yourPosition as LearningPosition)

  // Strategy Management Component
  const StrategyManagement = () => {
    const [editingStrategy, setEditingStrategy] = useState<PositionStrategy | null>(null)
    const [editMode, setEditMode] = useState(false)

    const handleSaveStrategy = (updatedStrategy: PositionStrategy) => {
      setPositionStrategies((prev) =>
        prev.map((strategy) => (strategy.position === updatedStrategy.position ? updatedStrategy : strategy)),
      )
      setEditMode(false)
      setEditingStrategy(null)
      const updatedStrategies = positionStrategies.map((strategy) =>
        strategy.position === updatedStrategy.position ? updatedStrategy : strategy,
      )
      localStorage.setItem("pokerStrategies", JSON.stringify(updatedStrategies))
    }

    const handleEditStrategy = (strategy: PositionStrategy) => {
      setEditingStrategy({ ...strategy })
      setEditMode(true)
    }

    const addHandToRange = (range: HandRange, type: "includes" | "excludes", newHand: string) => {
      if (editingStrategy) {
        const updatedStrategy = { ...editingStrategy }
        updatedStrategy[
          range === editingStrategy.patHands
            ? "patHands"
            : range === editingStrategy.draw1Hands
              ? "draw1Hands"
              : range === editingStrategy.draw2Hands
                ? "draw2Hands"
                : range === editingStrategy.draw3Hands
                  ? "draw3Hands"
                  : "draw4Hands"
        ][type].push(newHand)
        setEditingStrategy(updatedStrategy)
      }
    }

    const removeHandFromRange = (range: HandRange, type: "includes" | "excludes", index: number) => {
      if (editingStrategy) {
        const updatedStrategy = { ...editingStrategy }
        updatedStrategy[
          range === editingStrategy.patHands
            ? "patHands"
            : range === editingStrategy.draw1Hands
              ? "draw1Hands"
              : range === editingStrategy.draw2Hands
                ? "draw2Hands"
                : range === editingStrategy.draw3Hands
                  ? "draw3Hands"
                  : "draw4Hands"
        ][type].splice(index, 1)
        setEditingStrategy(updatedStrategy)
      }
    }

    return (
      <div className="p-6 bg-slate-800 text-white min-h-screen">
        <h1 className="text-2xl font-bold mb-6">シンプル戦略管理</h1>
        {editMode && editingStrategy ? (
          <div className="bg-slate-700 p-4 rounded-lg mb-6">
            <h2 className="text-xl font-semibold mb-4">編集中: {editingStrategy.position}</h2>

            {(["patHands", "draw1Hands", "draw2Hands", "draw3Hands", "draw4Hands"] as const).map((category) => (
              <div key={category} className="mb-6 border border-slate-600 p-4 rounded">
                <h3 className="font-semibold mb-3 capitalize text-lg">
                  {category.replace(/([A-Z])/g, " $1").replace("Hands", " Hands")}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Includes */}
                  <div>
                    <h4 className="text-green-400 font-medium mb-2">Includes (8s+, 8654+対応)</h4>
                    {editingStrategy[category].includes.map((item, index) => (
                      <div key={index} className="flex items-center gap-2 mb-1">
                        <Input
                          value={item}
                          onChange={(e) => {
                            const updatedStrategy = { ...editingStrategy }
                            updatedStrategy[category].includes[index] = e.target.value
                            setEditingStrategy(updatedStrategy)
                          }}
                          className="bg-slate-600 text-white text-sm"
                        />
                        <Button
                          onClick={() => removeHandFromRange(editingStrategy[category], "includes", index)}
                          className="bg-red-600 hover:bg-red-700 px-2 py-1 text-xs"
                        >
                          削除
                        </Button>
                      </div>
                    ))}
                    <Button
                      onClick={() => {
                        const newHand = prompt("新しいIncludeハンドを入力 (例: 8s+, 8654+):")
                        if (newHand) addHandToRange(editingStrategy[category], "includes", newHand)
                      }}
                      className="bg-green-600 hover:bg-green-700 px-2 py-1 text-xs mt-2"
                    >
                      追加
                    </Button>
                  </div>

                  {/* Excludes */}
                  <div>
                    <h4 className="text-red-400 font-medium mb-2">Excludes</h4>
                    {editingStrategy[category].excludes.map((item, index) => (
                      <div key={index} className="flex items-center gap-2 mb-1">
                        <Input
                          value={item}
                          onChange={(e) => {
                            const updatedStrategy = { ...editingStrategy }
                            updatedStrategy[category].excludes[index] = e.target.value
                            setEditingStrategy(updatedStrategy)
                          }}
                          className="bg-slate-600 text-white text-sm"
                        />
                        <Button
                          onClick={() => removeHandFromRange(editingStrategy[category], "excludes", index)}
                          className="bg-red-600 hover:bg-red-700 px-2 py-1 text-xs"
                        >
                          削除
                        </Button>
                      </div>
                    ))}
                    <Button
                      onClick={() => {
                        const newHand = prompt("新しいExcludeハンドを入力:")
                        if (newHand) addHandToRange(editingStrategy[category], "excludes", newHand)
                      }}
                      className="bg-red-600 hover:bg-red-700 px-2 py-1 text-xs mt-2"
                    >
                      追加
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex gap-2 mt-4">
              <Button onClick={() => handleSaveStrategy(editingStrategy)} className="bg-blue-600 hover:bg-blue-700">
                保存
              </Button>
              <Button
                onClick={() => {
                  setEditMode(false)
                  setEditingStrategy(null)
                }}
                className="bg-gray-600 hover:bg-gray-700"
              >
                キャンセル
              </Button>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="UTG" className="w-full">
            <TabsList className="grid w-full grid-cols-6">
              {positionStrategies.map((strategy) => (
                <TabsTrigger key={strategy.position} value={strategy.position}>
                  {strategy.position}
                </TabsTrigger>
              ))}
            </TabsList>
            {positionStrategies.map((strategy) => (
              <TabsContent key={strategy.position} value={strategy.position} className="mt-6">
                <div className="bg-slate-700 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-semibold">{strategy.position} Strategy</h2>
                      {strategy.inheritsFrom && (
                        <Badge variant="secondary">Inherits from {strategy.inheritsFrom}</Badge>
                      )}
                    </div>
                    <Button
                      onClick={() => handleEditStrategy(strategy)}
                      className="bg-yellow-600 hover:bg-yellow-700 px-3 py-1 text-sm"
                    >
                      編集
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="font-semibold text-green-400 mb-2">Pat Hands</h3>
                      // 戦略管理画面での個別戦略表示も更新（showBreakdown: trueに変更）
                      <div className="bg-slate-600 p-3 rounded text-sm">
                        {formatHandRangeWithBreakdown(strategy.patHands, true) || (
                          <div className="text-gray-400">Inherits from {strategy.inheritsFrom}</div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold text-blue-400 mb-2">Draw 1 Hands</h3>
                      // 戦略管理画面での個別戦略表示も更新（showBreakdown: trueに変更）
                      <div className="bg-slate-600 p-3 rounded text-sm">
                        {formatHandRangeWithBreakdown(strategy.draw1Hands, true) || (
                          <div className="text-gray-400">Inherits from {strategy.inheritsFrom}</div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold text-yellow-400 mb-2">Draw 2 Hands</h3>
                      // 戦略管理画面での個別戦略表示も更新（showBreakdown: trueに変更）
                      <div className="bg-slate-600 p-3 rounded text-sm">
                        {formatHandRangeWithBreakdown(strategy.draw2Hands, true) || (
                          <div className="text-gray-400">Inherits from {strategy.inheritsFrom}</div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold text-purple-400 mb-2">Draw 3 Hands</h3>
                      // 戦略管理画面での個別戦略表示も更新（showBreakdown: trueに変更）
                      <div className="bg-slate-600 p-3 rounded text-sm">
                        {formatHandRangeWithBreakdown(strategy.draw3Hands, true) || (
                          <div className="text-gray-400">Inherits from {strategy.inheritsFrom}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <h3 className="font-semibold text-cyan-400 mb-2">Full Strategy (with inheritance)</h3>
                    <div className="bg-slate-600 p-3 rounded text-sm">
                      <div className="mb-2">
                        <strong>Pat:</strong>{" "}
                        {formatHandRangeWithBreakdown(getFullStrategy(strategy.position).patHands, true)}
                      </div>
                      <div className="mb-2">
                        <strong>Draw1:</strong>{" "}
                        {formatHandRangeWithBreakdown(getFullStrategy(strategy.position).draw1Hands, true)}
                      </div>
                      <div className="mb-2">
                        <strong>Draw2:</strong>{" "}
                        {formatHandRangeWithBreakdown(getFullStrategy(strategy.position).draw2Hands, true)}
                      </div>
                      <div>
                        <strong>Draw3:</strong>{" "}
                        {formatHandRangeWithBreakdown(getFullStrategy(strategy.position).draw3Hands, true)}
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}
        <div className="mt-6 flex gap-2">
          <Button
            onClick={() => setGameState((prev) => ({ ...prev, phase: "learning" }))}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Back to Learning
          </Button>
          <Button
            onClick={() => {
              const exported = JSON.stringify(positionStrategies, null, 2)
              navigator.clipboard.writeText(exported)
              alert("シンプル戦略をクリップボードにコピーしました")
            }}
            className="bg-green-600 hover:bg-green-700"
          >
            戦略エクスポート
          </Button>
          <Button
            onClick={() => {
              const imported = prompt("シンプル戦略JSONを貼り付けてください:")
              if (imported) {
                try {
                  const parsed = JSON.parse(imported)
                  setPositionStrategies(parsed)
                  localStorage.setItem("pokerStrategies", imported)
                  alert("シンプル戦略をインポートしました")
                } catch (e) {
                  alert("無効なJSONです")
                }
              }
            }}
            className="bg-purple-600 hover:bg-purple-700"
          >
            戦略インポート
          </Button>
        </div>
        // デバッグ用の戦略検証セクションを戦略管理画面に追加 // 戦略管理画面の最後に以下のセクションを追加：
        <div className="mt-8 bg-slate-700 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-4 text-cyan-400">Better Hand表記検証</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h3 className="font-semibold text-green-400 mb-2">Pat Hand表記テスト</h3>
              <div className="bg-slate-600 p-3 rounded">
                <div className="mb-2">
                  <strong>8s+:</strong> {expandBetterHandNotation("8s+").slice(0, 5).join(", ")}...
                </div>
                <div className="mb-2">
                  <strong>7s+:</strong> {expandBetterHandNotation("7s+").slice(0, 5).join(", ")}...
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-blue-400 mb-2">Draw表記テスト</h3>
              <div className="bg-slate-600 p-3 rounded">
                <div className="mb-2">
                  <strong>8654+:</strong> {expandBetterHandNotation("8654+").slice(0, 5).join(", ")}...
                </div>
                <div className="mb-2">
                  <strong>542+:</strong> {expandBetterHandNotation("542+").join(", ")}
                </div>
                <div className="mb-2">
                  <strong>752+:</strong> {expandBetterHandNotation("752+").join(", ")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (gameState.phase === "strategy-management") {
    return <StrategyManagement />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-600/20 to-transparent"></div>
      </div>

      <div className="absolute top-4 left-4 text-white">
        <div className="text-sm font-medium">
          Your Position: <span className="font-bold text-amber-400">{yourPosition}</span>
        </div>
        <div className="text-xs text-blue-300">2-7 TRIPLE DRAW • SIMPLE STRATEGY</div>
        <div className="text-xs text-orange-300 mt-1">Better Hand表記: 8s+, 8654+対応</div>
      </div>

      <div className="absolute top-4 right-4 text-white">
        <div className="text-sm font-medium">
          Score: {gameState.score.correct}/{gameState.score.total}
        </div>
        <div className="text-xs text-blue-300">
          {gameState.score.total > 0 ? `${Math.round((gameState.score.correct / gameState.score.total) * 100)}%` : "0%"}
        </div>
        <Button
          onClick={() => setGameState((prev) => ({ ...prev, phase: "strategy-management" }))}
          className="mt-2 bg-slate-600 hover:bg-slate-700 text-xs px-2 py-1"
        >
          シンプル戦略管理
        </Button>
      </div>

      <div className="absolute top-20 left-4 max-w-xs">
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-4 border-2 border-blue-500/30">
          <div className="text-white text-sm font-semibold mb-3">{yourPosition} Strategy</div>
          // メインゲーム画面の戦略表示部分も更新
          <div className="text-xs text-blue-300 space-y-2">
            <div>
              <span className="text-green-400 font-semibold">Pat:</span>
              <div>{formatHandRangeWithBreakdown(currentStrategy.patHands, true)}</div>
            </div>
            <div>
              <span className="text-blue-400 font-semibold">Draw1:</span>
              <div>{formatHandRangeWithBreakdown(currentStrategy.draw1Hands, true)}</div>
            </div>
            <div>
              <span className="text-yellow-400 font-semibold">Draw2:</span>
              <div>{formatHandRangeWithBreakdown(currentStrategy.draw2Hands, true)}</div>
            </div>
            <div>
              <span className="text-purple-400 font-semibold">Draw3:</span>
              <div>{formatHandRangeWithBreakdown(currentStrategy.draw3Hands, true)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 right-8 z-20">
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-4 border-2 border-blue-500/30 min-w-[250px]">
          <div className="text-white text-sm font-semibold mb-3 text-center">Your Action</div>
          {!gameState.showAnswer ? (
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => handlePlayerAction("raise")}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 text-sm font-semibold"
              >
                Raise
              </Button>
              <Button
                onClick={() => handlePlayerAction("fold")}
                className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 text-sm font-semibold"
              >
                Fold
              </Button>
            </div>
          ) : (
            <div className="text-center">
              <div className="mb-3">
                <div className="text-white text-sm mb-1">
                  You chose: <span className="font-bold text-blue-300">{gameState.playerAction?.toUpperCase()}</span>
                </div>
                <div className="text-white text-sm mb-1">
                  Correct: <span className="font-bold text-green-400">{gameState.correctAction.toUpperCase()}</span>
                </div>
                <div className={`text-sm font-bold ${isCorrect ? "text-green-400" : "text-red-400"}`}>
                  {isCorrect ? "✓ CORRECT!" : "✗ INCORRECT"}
                </div>
              </div>
              <div className="text-xs text-blue-300 mb-3 border-t border-blue-500/30 pt-2">
                <div className="font-semibold mb-1">{gameState.handCategory}</div>
                <div className="text-left mb-2">{gameState.explanation}</div>
                <div className="text-left text-xs text-amber-300 bg-slate-700/50 p-2 rounded">
                  <div>
                    <strong>Position:</strong> {yourPosition}
                  </div>
                  <div>
                    <strong>Rule Used:</strong> {gameState.ruleUsed}
                  </div>
                  {gameState.benchmark && (
                    <div>
                      <strong>Benchmark:</strong> {gameState.benchmark}
                    </div>
                  )}
                </div>
                {!gameState.isPlayable && gameState.minimumRaiseExample && (
                  <div className="text-left text-xs text-green-300 bg-slate-700/50 p-2 rounded mt-2">
                    <div>
                      <strong>最低レイズハンド例:</strong>
                    </div>
                    <div>{gameState.minimumRaiseExample}</div>
                  </div>
                )}
              </div>
              <Button onClick={nextHand} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 text-sm">
                Next Hand
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center min-h-screen p-8">
        <div className="relative w-full max-w-6xl aspect-[4/3]">
          <div className="absolute inset-0 rounded-full border-4 border-blue-600/30 bg-gradient-to-br from-blue-800/40 to-slate-900/60 backdrop-blur-sm">
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
              <div className="text-4xl font-bold text-blue-400/30 mb-2">♠</div>
              <div className="text-xl font-bold text-blue-300/50 mb-4">MIXED POKER</div>
            </div>
            {players.map((player, index) => (
              <div key={player.id} className="absolute" style={playerPositions[index]}>
                <div className="flex flex-col items-center">
                  <div
                    className={`bg-slate-800/80 backdrop-blur-sm rounded-lg p-3 mb-3 border-2 transition-all duration-300 relative ${
                      player.isActive ? "border-amber-400 shadow-lg shadow-amber-400/20" : "border-blue-500/30"
                    }`}
                  >
                    <div className="flex items-center justify-center mb-2">
                      <Avatar className="w-12 h-12 border-2 border-blue-400">
                        <AvatarImage src={`/placeholder.svg?height=48&width=48`} />
                        <AvatarFallback className="bg-blue-600 text-white text-sm">
                          {player.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="text-white font-semibold text-sm text-center mb-1">{player.name}</div>
                    <div
                      className={`text-xs text-center mb-1 font-bold ${
                        player.isActive ? "text-amber-400" : "text-blue-300"
                      }`}
                    >
                      {player.position}
                    </div>
                    <div className="text-blue-300 text-sm text-center font-medium">{player.chips.toFixed(2)} ♦</div>
                    {player.isDealer && (
                      <div className="absolute bottom-1 right-1 bg-white text-black rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold z-10 shadow-lg">
                        D
                      </div>
                    )}
                  </div>
                  {player.id === "6" && gameState.currentHand.length > 0 ? (
                    <div className="flex gap-1">
                      {gameState.currentHand.map((card, cardIndex) => {
                        const getCardStyle = (suit: string) => {
                          switch (suit) {
                            case "♠":
                              return "bg-black text-white"
                            case "♣":
                              return "bg-green-600 text-white"
                            case "♥":
                              return "bg-red-600 text-white"
                            case "♦":
                              return "bg-blue-600 text-white"
                            default:
                              return "bg-black text-white"
                          }
                        }
                        const cardStyle = getCardStyle(card.suit)
                        return (
                          <Card
                            key={cardIndex}
                            className={`w-14 h-20 border-2 border-gray-300 shadow-lg flex items-start justify-start p-1 ${cardStyle}`}
                          >
                            <div className="text-white font-bold leading-tight">
                              <div className="text-2xl">{card.rank}</div>
                              <div className="text-xl -mt-1">{card.suit}</div>
                            </div>
                          </Card>
                        )
                      })}
                    </div>
                  ) : player.id !== "6" ? (
                    <div className="flex gap-1">
                      {player.cards.map((_, cardIndex) => (
                        <Card
                          key={cardIndex}
                          className="w-12 h-16 bg-gradient-to-br from-blue-500 to-blue-700 border-2 border-blue-400"
                        >
                          <div className="w-full h-full flex items-center justify-center text-blue-200 text-xs">♠</div>
                        </Card>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
