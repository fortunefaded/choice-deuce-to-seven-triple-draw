"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

interface Player {
  id: string
  name: string
  chips: number
  cards: string[]
  position: string
  isActive: boolean
  isDealer: boolean
}

interface HandCard {
  rank: string
  suit: string
  display: string
  value: number // For 2-7 evaluation (lower is better)
}

// Add these interfaces after the existing ones
interface MistakeRecord {
  id: string
  hand: HandCard[]
  userAction: string
  correctAction: string
  category: string
  explanation: string
  timestamp: number
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

// Update the GameState interface to include drill mode
interface GameState {
  pot: number
  currentBet: number
  drawsLeft: number
  phase: "learning" | "drill"
  currentHand: HandCard[]
  isPlayable: boolean
  showAnswer: boolean
  score: { correct: number; total: number }
  playerAction: string | null
  correctAction: string
  handCategory: string
  explanation: string
  mistakes: MistakeRecord[]
  drillMode: DrillModeState
}

export default function UTGLearningApp() {
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
  })

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

  // Position players around the table using specific degree positions
  const playerPositions = [
    { bottom: "8%", left: "50%", transform: "translateX(-50%)" }, // UTG (You) - 180°
    { bottom: "25%", left: "15%" }, // HJ - 240°
    { top: "25%", left: "15%" }, // CO - 300°
    { top: "8%", left: "50%", transform: "translateX(-50%)" }, // BU (Dealer) - 0°
    { top: "25%", right: "15%" }, // SB - 60°
    { bottom: "25%", right: "15%" }, // BB - 120°
  ]

  const generateRandomHand = (): HandCard[] => {
    const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"]
    const suits = ["♠", "♥", "♦", "♣"]
    const hand: HandCard[] = []
    const usedCards = new Set<string>()

    // 2-7 values: 2=2, 3=3, ..., 7=7, 8=8, 9=9, T=10, J=11, Q=12, K=13, A=14 (high is bad)
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
        hand.push({
          rank,
          suit,
          display: `${rank}${suit}`,
          value: getValue(rank),
        })
      }
    }

    return hand.sort((a, b) => b.value - a.value) // Sort high to low for display
  }

  // Helper function to compare 2-7 lowball hands (lower is better)
  const compareLowballHands = (hand1: number[], hand2: number[]): number => {
    // Sort both hands high to low for comparison
    const sorted1 = [...hand1].sort((a, b) => b - a)
    const sorted2 = [...hand2].sort((a, b) => b - a)

    // Compare from highest card down (in 2-7, we want the lowest high card)
    for (let i = 0; i < sorted1.length; i++) {
      if (sorted1[i] !== sorted2[i]) {
        return sorted1[i] - sorted2[i] // Lower is better
      }
    }
    return 0 // Hands are equal
  }

  const evaluateUTGHand = (
    hand: HandCard[],
  ): { isPlayable: boolean; correctAction: string; category: string; explanation: string } => {
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

    // ① Pat Hand Check
    if (!hasPair && !hasFlush && !hasStraightInHand && !hasWheel) {
      const highCard = values[4]
      if (highCard <= 8) {
        return {
          isPlayable: true,
          correctAction: "raise",
          category: `Pat ${highCard}-high`,
          explanation: `A pat ${highCard}-high is a strong made hand. A standard raise from UTG.`,
        }
      }
    }

    const uniqueValues = Array.from(new Set(values)).sort((a, b) => a - b)

    // ② Exceptional Fold Check (x7654)
    if (uniqueValues.length >= 4) {
      const fourLowest = uniqueValues.slice(0, 4)
      if (fourLowest.toString() === "4,5,6,7") {
        return {
          isPlayable: false,
          correctAction: "fold",
          category: "x7654 Trap Hand",
          explanation: "This hand draws to a straight (76543) and is a dangerous trap. Always fold.",
        }
      }
    }

    // ③ Draw 1 (d1s) Check - MOVED BEFORE special cases
    let fourBestCards = null
    if (uniqueValues.length === 4) {
      // Paired hand, the unique values are the draw.
      fourBestCards = uniqueValues
    } else if (uniqueValues.length === 5) {
      // Rainbow hand, discard the highest card.
      fourBestCards = uniqueValues.slice(0, 4)
    }

    if (fourBestCards && !isStraight(fourBestCards)) {
      const benchmark8654 = [8, 6, 5, 4]
      if (compareLowballHands(fourBestCards, benchmark8654) <= 0) {
        return {
          isPlayable: true,
          correctAction: "raise",
          category: `Draw 1 (${fourBestCards.join("")})`,
          explanation: `This hand has a four-card draw (${fourBestCards.join(
            ", ",
          )}) that is 8654 or better. This is a strong Draw 1.`,
        }
      }
    }

    // ④ Special 632xx / 762xx Check - ONLY for hands that failed Draw 1
    // Make this more specific: only trigger for hands that are exactly 632 or 762 pattern
    const has632Pattern =
      uniqueValues.length === 5 &&
      values.includes(6) &&
      values.includes(3) &&
      values.includes(2) &&
      Math.max(...values) > 8 // High card is higher than 8
    const has762Pattern =
      uniqueValues.length === 5 &&
      values.includes(7) &&
      values.includes(6) &&
      values.includes(2) &&
      Math.max(...values) > 8 // High card is higher than 8

    if (has632Pattern || has762Pattern) {
      if (valueCounts[2] >= 2) {
        return {
          isPlayable: true,
          correctAction: "raise",
          category: "Draw 2 (Special Blocker)",
          explanation: `A hand like ${
            has632Pattern ? "632" : "762"
          } with a pair of 2s is a playable Draw 2 due to the blocker effect.`,
        }
      } else {
        return {
          isPlayable: false,
          correctAction: "fold",
          category: "Weak Draw 2",
          explanation: `A hand like ${has632Pattern ? "632" : "762"} without a pair of 2s is too weak to play from UTG.`,
        }
      }
    }

    // ⑤ General Draw 2 (d2s) Check
    if (values.includes(2)) {
      const threeCardDraws = []
      if (uniqueValues.length >= 3) {
        const otherCards = uniqueValues.filter((v) => v !== 2)
        if (otherCards.length >= 2) {
          threeCardDraws.push([2, otherCards[0], otherCards[1]])
        }
      }

      for (const best3With2 of threeCardDraws) {
        if (!best3With2) continue

        const benchmarks = {
          "542": [5, 4, 2],
          "752": [7, 5, 2],
          "842": [8, 4, 2],
        }
        for (const [name, benchmark] of Object.entries(benchmarks)) {
          if (compareLowballHands(best3With2, benchmark) <= 0) {
            return {
              isPlayable: true,
              correctAction: "raise",
              category: `Draw 2 (${name}+)`,
              explanation: `This hand has a three-card draw (${best3With2.join(
                ", ",
              )}) that is ${name} or better. This is a standard Draw 2.`,
            }
          }
        }
      }
    }

    // ⑥ Exceptional Blocker Raise Check
    const twoCount = valueCounts[2] || 0
    const threeCount = valueCounts[3] || 0
    if (twoCount >= 2 && threeCount >= 2) {
      // 3322x
      return {
        isPlayable: true,
        correctAction: "raise",
        category: "Draw 3 (3322x Blocker)",
        explanation: "This hand has strong blockers (two 2s and two 3s) and is a playable Draw 3.",
      }
    }
    if (twoCount >= 3 && (values.includes(3) || values.includes(4) || values.includes(7))) {
      // 3222x, 4222x, 7222x
      const kicker = values.find((v) => v === 3 || v === 4 || v === 7)
      return {
        isPlayable: true,
        correctAction: "raise",
        category: `Draw 3 (${kicker}222x Blocker)`,
        explanation: `With three 2s, this hand has a powerful blocker effect, making it a playable Draw 3.`,
      }
    }

    // Default to Fold
    return {
      isPlayable: false,
      correctAction: "fold",
      category: "Fold",
      explanation: "This hand does not meet the minimum requirements to be played from UTG.",
    }
  }

  const dealNewHand = () => {
    const newHand = generateRandomHand()
    const evaluation = evaluateUTGHand(newHand)

    setGameState((prev) => ({
      ...prev,
      currentHand: newHand,
      isPlayable: evaluation.isPlayable,
      correctAction: evaluation.correctAction,
      handCategory: evaluation.category,
      explanation: evaluation.explanation,
      showAnswer: false,
      playerAction: null,
    }))

    setPlayers((prev) =>
      prev.map((player) => (player.id === "6" ? { ...player, cards: newHand.map((card) => card.display) } : player)),
    )
  }

  // Update the handlePlayerAction function to track mistakes
  const handlePlayerAction = (action: string) => {
    const isCorrect = action === gameState.correctAction

    // If it's a mistake, record it
    if (!isCorrect && gameState.phase === "learning") {
      const mistakeRecord: MistakeRecord = {
        id: `mistake_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        hand: [...gameState.currentHand],
        userAction: action,
        correctAction: gameState.correctAction,
        category: gameState.handCategory,
        explanation: gameState.explanation,
        timestamp: Date.now(),
      }

      setGameState((prev) => ({
        ...prev,
        playerAction: action,
        showAnswer: true,
        score: {
          correct: prev.score.correct + (isCorrect ? 1 : 0),
          total: prev.score.total + 1,
        },
        mistakes: [...prev.mistakes, mistakeRecord],
      }))
    } else if (gameState.phase === "drill") {
      // Handle drill mode scoring
      setGameState((prev) => ({
        ...prev,
        playerAction: action,
        showAnswer: true,
        drillMode: {
          ...prev.drillMode,
          reviewStats: {
            totalReviewed: prev.drillMode.reviewStats.totalReviewed + 1,
            correctOnReview: prev.drillMode.reviewStats.correctOnReview + (isCorrect ? 1 : 0),
          },
        },
      }))
    } else {
      // Regular learning mode, correct answer
      setGameState((prev) => ({
        ...prev,
        playerAction: action,
        showAnswer: true,
        score: {
          correct: prev.score.correct + (isCorrect ? 1 : 0),
          total: prev.score.total + 1,
        },
      }))
    }
  }

  // Add drill mode functions
  const startDrillMode = () => {
    if (gameState.mistakes.length === 0) return

    setGameState((prev) => ({
      ...prev,
      phase: "drill",
      drillMode: {
        isActive: true,
        mistakePool: [...prev.mistakes],
        currentMistakeIndex: 0,
        reviewStats: {
          totalReviewed: 0,
          correctOnReview: 0,
        },
      },
    }))

    loadDrillHand(0)
  }

  const loadDrillHand = (index: number) => {
    const mistake = gameState.mistakes[index]
    if (!mistake) return

    const evaluation = evaluateUTGHand(mistake.hand)

    setGameState((prev) => ({
      ...prev,
      currentHand: mistake.hand,
      isPlayable: evaluation.isPlayable,
      correctAction: evaluation.correctAction,
      handCategory: evaluation.category,
      explanation: evaluation.explanation,
      showAnswer: false,
      playerAction: null,
      drillMode: {
        ...prev.drillMode,
        currentMistakeIndex: index,
      },
    }))

    setPlayers((prev) =>
      prev.map((player) =>
        player.id === "6" ? { ...player, cards: mistake.hand.map((card) => card.display) } : player,
      ),
    )
  }

  const nextDrillHand = () => {
    const nextIndex = gameState.drillMode.currentMistakeIndex + 1
    if (nextIndex < gameState.mistakes.length) {
      loadDrillHand(nextIndex)
    } else {
      // End of drill mode
      setGameState((prev) => ({
        ...prev,
        phase: "learning",
        drillMode: {
          ...prev.drillMode,
          isActive: false,
        },
      }))
      dealNewHand()
    }
  }

  const exitDrillMode = () => {
    setGameState((prev) => ({
      ...prev,
      phase: "learning",
      drillMode: {
        ...prev.drillMode,
        isActive: false,
      },
    }))
    dealNewHand()
  }

  const clearMistakes = () => {
    setGameState((prev) => ({
      ...prev,
      mistakes: [],
    }))
  }

  // Update the nextHand function to handle drill mode
  const nextHand = () => {
    if (gameState.phase === "drill") {
      nextDrillHand()
    } else {
      dealNewHand()
    }
  }

  useEffect(() => {
    dealNewHand()
  }, [])

  const isCorrect = gameState.playerAction === gameState.correctAction

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-600/20 to-transparent"></div>
      </div>

      {/* Header */}
      <div className="absolute top-4 left-4 text-white">
        <div className="text-sm font-medium">UTG Learning Mode</div>
        <div className="text-xs text-blue-300">2-7 TRIPLE DRAW • STARTING HANDS</div>
      </div>

      {/* Score */}
      <div className="absolute top-4 right-4 text-white">
        <div className="text-sm font-medium">
          Score: {gameState.score.correct}/{gameState.score.total}
        </div>
        <div className="text-xs text-blue-300">
          {gameState.score.total > 0 ? `${Math.round((gameState.score.correct / gameState.score.total) * 100)}%` : "0%"}
        </div>
      </div>

      {/* Drill Mode Controls - Top Center */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 text-white">
        {gameState.phase === "learning" ? (
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-sm font-medium">Mistakes: {gameState.mistakes.length}</div>
              {gameState.mistakes.length > 0 && (
                <button
                  onClick={startDrillMode}
                  className="text-xs bg-orange-600 hover:bg-orange-700 px-3 py-1 rounded mt-1 transition-colors"
                >
                  Review Mistakes
                </button>
              )}
            </div>
            {gameState.mistakes.length > 0 && (
              <button
                onClick={clearMistakes}
                className="text-xs bg-red-600 hover:bg-red-700 px-2 py-1 rounded transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        ) : (
          <div className="text-center">
            <div className="text-lg font-bold text-orange-400 mb-1">DRILL MODE</div>
            <div className="text-sm">
              Hand {gameState.drillMode.currentMistakeIndex + 1} of {gameState.mistakes.length}
            </div>
            <div className="text-xs text-blue-300">
              Review Score: {gameState.drillMode.reviewStats.correctOnReview}/
              {gameState.drillMode.reviewStats.totalReviewed}
              {gameState.drillMode.reviewStats.totalReviewed > 0 &&
                ` (${Math.round((gameState.drillMode.reviewStats.correctOnReview / gameState.drillMode.reviewStats.totalReviewed) * 100)}%)`}
            </div>
            <button
              onClick={exitDrillMode}
              className="text-xs bg-gray-600 hover:bg-gray-700 px-3 py-1 rounded mt-2 transition-colors"
            >
              Exit Drill Mode
            </button>
          </div>
        )}
      </div>

      {/* UTG Strategy Guide - Left Side */}
      <div className="absolute top-20 left-4 max-w-xs">
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-4 border-2 border-blue-500/30">
          <div className="text-white text-sm font-semibold mb-3">UTG Strategy Guide</div>
          <div className="text-xs text-blue-300 space-y-2">
            <div>
              <span className="text-green-400 font-semibold">RAISE:</span>
            </div>
            <div>• Pat 8s+ (8-high or better)</div>
            <div>• Draw 1: 8654+ (8654 or better)</div>
            <div>• Draw 2: 542+, 752+, 842+</div>
            <div>• Draw 3: 32/42/72 with blockers</div>
            <div className="pt-2">
              <span className="text-red-400 font-semibold">FOLD:</span>
            </div>
            <div>• All other hands</div>
            <div>• Straights & flushes</div>
            <div>• Weak drawing hands</div>
            <div className="pt-2 text-yellow-300">
              <div className="font-semibold">Remember:</div>
              <div>The #1 hand is 2-3-4-5-7.</div>
              <div>Lower cards are better!</div>
              <div>(e.g., 7-6-4-3-2 is better than 8-5-4-3-2)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons - Bottom Right */}
      <div className="absolute bottom-8 right-8 z-20">
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-4 border-2 border-blue-500/30 min-w-[250px]">
          <div className="text-white text-sm font-semibold mb-3 text-center">Your Action</div>

          {!gameState.showAnswer ? (
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => handlePlayerAction("raise")}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 text-sm font-semibold min-w-[80px]"
              >
                Raise
              </Button>
              <Button
                onClick={() => handlePlayerAction("call")}
                className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 text-sm font-semibold min-w-[80px]"
                disabled
                title="Call is rarely correct from UTG"
              >
                Call
              </Button>
              <Button
                onClick={() => handlePlayerAction("fold")}
                className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 text-sm font-semibold min-w-[80px]"
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

                {/* Show original mistake info in drill mode */}
                {gameState.phase === "drill" && (
                  <div className="text-xs text-orange-300 mt-2 border-t border-orange-500/30 pt-2">
                    <div className="font-semibold">Original Mistake:</div>
                    <div>
                      You chose: {gameState.mistakes[gameState.drillMode.currentMistakeIndex]?.userAction.toUpperCase()}
                    </div>
                    <div>
                      Correct:{" "}
                      {gameState.mistakes[gameState.drillMode.currentMistakeIndex]?.correctAction.toUpperCase()}
                    </div>
                  </div>
                )}
              </div>

              <div className="text-xs text-blue-300 mb-3 border-t border-blue-500/30 pt-2">
                <div className="font-semibold mb-1">{gameState.handCategory}</div>
                <div className="text-left">{gameState.explanation}</div>
              </div>

              <Button onClick={nextHand} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 text-sm">
                {gameState.phase === "drill"
                  ? gameState.drillMode.currentMistakeIndex < gameState.mistakes.length - 1
                    ? "Next Mistake"
                    : "Finish Drill"
                  : "Next Hand"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Main Table Container */}
      <div className="flex items-center justify-center min-h-screen p-8">
        <div className="relative w-full max-w-6xl aspect-[4/3]">
          {/* Poker Table */}
          <div className="absolute inset-0 rounded-full border-4 border-blue-600/30 bg-gradient-to-br from-blue-800/40 to-slate-900/60 backdrop-blur-sm">
            {/* Center Logo and Info */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
              <div className="text-4xl font-bold text-blue-400/30 mb-2">♠</div>
              <div className="text-xl font-bold text-blue-300/50 mb-4">MIXED POKER</div>
              <div className="text-lg text-blue-300/70 mb-2">UTG Starting Hands</div>

              {/* Strategy Reminder */}
              <div className="text-xs text-blue-400/60 max-w-md">
                <div>Best hand: 2-3-4-5-7 (no straights/flushes)</div>
                <div>UTG is mostly raise-or-fold</div>
                <div>Strong hands: Pat 8s+, Draw 1-3 with requirements</div>
              </div>
            </div>

            {/* Players */}
            {players.map((player, index) => (
              <div key={player.id} className="absolute" style={playerPositions[index]}>
                <div className="flex flex-col items-center">
                  {/* Dealer Button */}
                  {player.isDealer && (
                    <div className="absolute -top-2 -right-2 bg-white text-black rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold z-10">
                      D
                    </div>
                  )}

                  {/* Player Info Box */}
                  <div
                    className={`bg-slate-800/80 backdrop-blur-sm rounded-lg p-3 mb-3 border-2 ${
                      player.isActive ? "border-amber-400 shadow-lg shadow-amber-400/20" : "border-blue-500/30"
                    }`}
                  >
                    {/* Avatar */}
                    <div className="flex items-center justify-center mb-2">
                      <Avatar className="w-12 h-12 border-2 border-blue-400">
                        <AvatarImage src={`/placeholder.svg?height=48&width=48`} />
                        <AvatarFallback className="bg-blue-600 text-white text-sm">
                          {player.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </div>

                    {/* Player Name */}
                    <div className="text-white font-semibold text-sm text-center mb-1">{player.name}</div>

                    {/* Position */}
                    <div
                      className={`text-xs text-center mb-1 ${player.position === "UTG" ? "text-red-400" : "text-blue-300"}`}
                    >
                      {player.position}
                    </div>

                    {/* Chip Amount */}
                    <div className="text-blue-300 text-sm text-center font-medium">{player.chips.toFixed(2)} ♦</div>
                  </div>

                  {/* Player Cards */}
                  {player.id === "6" && gameState.currentHand.length > 0 ? (
                    <div className="flex gap-1">
                      {gameState.currentHand.map((card, cardIndex) => {
                        // Determine background color for four-color deck
                        const getCardStyle = (suit: string) => {
                          switch (suit) {
                            case "♠":
                              return "bg-black text-white" // Spades - Black background
                            case "♣":
                              return "bg-green-600 text-white" // Clubs - Green background
                            case "♥":
                              return "bg-red-600 text-white" // Hearts - Red background
                            case "♦":
                              return "bg-blue-600 text-white" // Diamonds - Blue background
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
                            {/* Top left rank and suit - as large as possible */}
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
                      {player.cards.map((card, cardIndex) => (
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

      {/* Mistakes Review Panel - Right Side */}
      {gameState.mistakes.length > 0 && gameState.phase === "learning" && (
        <div className="absolute top-20 right-4 max-w-xs">
          <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-4 border-2 border-orange-500/30">
            <div className="text-white text-sm font-semibold mb-3">Recent Mistakes</div>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {gameState.mistakes
                .slice(-5)
                .reverse()
                .map((mistake, index) => (
                  <div key={mistake.id} className="text-xs border-b border-orange-500/20 pb-2">
                    <div className="text-orange-300 font-semibold">{mistake.category}</div>
                    <div className="text-gray-300">
                      Cards: {mistake.hand.map((card) => card.rank + card.suit).join(" ")}
                    </div>
                    <div className="text-red-400">You: {mistake.userAction.toUpperCase()}</div>
                    <div className="text-green-400">Correct: {mistake.correctAction.toUpperCase()}</div>
                  </div>
                ))}
            </div>
            {gameState.mistakes.length > 5 && (
              <div className="text-xs text-gray-400 mt-2">...and {gameState.mistakes.length - 5} more</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
