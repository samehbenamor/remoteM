"use client"

import { useState, useEffect, useRef } from "react"
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  PanResponder,
  Alert,
  Dimensions,
  StatusBar,
  Animated,
} from "react-native"
import { io, type Socket } from "socket.io-client"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import Constants from "expo-constants"
import { Accelerometer } from "expo-sensors"

const { width, height } = Dimensions.get("window")

export default function Index() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [serverIP, setServerIP] = useState<string>("")
  const [sensitivity, setSensitivity] = useState(1.5)
  const [showSettings, setShowSettings] = useState(false)
  const [shakeEnabled, setShakeEnabled] = useState(true)

  const connectionAnimation = useRef(new Animated.Value(0)).current
  const buttonPressAnimation = useRef(new Animated.Value(1)).current

  // Track previous position for more precise movement
  const lastPosition = useRef({ x: 0, y: 0 })
  const isFirstMove = useRef(true)

  // Tap detection for trackpad - Fixed TypeScript types
  const lastTapTime = useRef(0)
  const tapTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasMoved = useRef(false)

  // Shake detection
  const lastShakeTime = useRef(0)
  const shakeThreshold = 2.5

  // Auto-detect development server IP
  useEffect(() => {
    const getDevServerIP = () => {
      try {
        const manifestUrl = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost

        if (manifestUrl) {
          const ip = manifestUrl.split(":")[0]
          if (ip && ip.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
            setServerIP(ip)
            console.log("Auto-detected server IP:", ip)
            return
          }
        }

        setServerIP("192.168.1.5")
      } catch (error) {
        console.log("Could not auto-detect IP, using fallback")
        setServerIP("192.168.1.5")
      }
    }

    getDevServerIP()
  }, [])

  // Shake detection setup
  useEffect(() => {
    if (!shakeEnabled) return

    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      const acceleration = Math.sqrt(x * x + y * y + z * z)
      const now = Date.now()

      if (acceleration > shakeThreshold && now - lastShakeTime.current > 1000) {
        lastShakeTime.current = now
        handleShakeGesture()
      }
    })

    Accelerometer.setUpdateInterval(100)

    return () => subscription?.remove()
  }, [shakeEnabled, socket, isConnected])

  // Handle shake gesture
  const handleShakeGesture = () => {
    if (socket && isConnected) {
      socket.emit("screen-toggle")
      // Visual feedback
      Animated.sequence([
        Animated.timing(connectionAnimation, {
          toValue: 0.5,
          duration: 100,
          useNativeDriver: false,
        }),
        Animated.timing(connectionAnimation, {
          toValue: 1,
          duration: 100,
          useNativeDriver: false,
        }),
      ]).start()
    }
  }

  // Animate connection status
  useEffect(() => {
    Animated.timing(connectionAnimation, {
      toValue: isConnected ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start()
  }, [isConnected])

  // Auto-connect when IP is detected
  useEffect(() => {
    if (serverIP && !isConnected && !isConnecting) {
      const timer = setTimeout(() => {
        connectToServer()
      }, 1000)

      return () => clearTimeout(timer)
    }
  }, [serverIP])

  // Initialize socket connection
  const connectToServer = async () => {
    if (!serverIP.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
      Alert.alert("Invalid IP", "Could not detect valid server IP address")
      return
    }

    setIsConnecting(true)

    if (socket) {
      socket.disconnect()
    }

    const newSocket = io(`http://${serverIP}:3000`, {
      transports: ["websocket"],
      timeout: 5000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    newSocket.on("connect", () => {
      setIsConnected(true)
      setIsConnecting(false)
    })

    newSocket.on("disconnect", () => {
      setIsConnected(false)
      setIsConnecting(false)
    })

    newSocket.on("connect_error", (err) => {
      setIsConnected(false)
      setIsConnecting(false)
      Alert.alert(
        "❌ Connection Error",
        `Failed to connect to ${serverIP}:3000\n\nMake sure your Node.js server is running.`,
      )
    })

    newSocket.on("reconnect", () => {
      setIsConnected(true)
    })

    setSocket(newSocket)
  }

  const disconnect = () => {
    if (socket) {
      socket.disconnect()
      setSocket(null)
      setIsConnected(false)
    }
  }

  // Clean up socket on unmount
  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect()
      }
    }
  }, [socket])

  // Enhanced pan responder - FIXED to handle both movement and gestures
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      isFirstMove.current = true
      hasMoved.current = false
      lastPosition.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY }

      // Check for two-finger tap (right-click)
      if (evt.nativeEvent.touches.length === 2) {
        if (socket && isConnected) {
          socket.emit("mouse-click", "right")
          // Visual feedback
          Animated.sequence([
            Animated.timing(buttonPressAnimation, {
              toValue: 0.95,
              duration: 100,
              useNativeDriver: true,
            }),
            Animated.timing(buttonPressAnimation, {
              toValue: 1,
              duration: 100,
              useNativeDriver: true,
            }),
          ]).start()
        }
        return
      }
    },
    onPanResponderMove: (evt, gestureState) => {
      // Skip if this was a two-finger gesture
      if (evt.nativeEvent.touches.length > 1) return

      hasMoved.current = true

      if (socket && isConnected) {
        const currentX = evt.nativeEvent.pageX
        const currentY = evt.nativeEvent.pageY

        let dx, dy

        if (isFirstMove.current) {
          dx = gestureState.dx * sensitivity
          dy = gestureState.dy * sensitivity
          isFirstMove.current = false
        } else {
          dx = (currentX - lastPosition.current.x) * sensitivity
          dy = (currentY - lastPosition.current.y) * sensitivity
        }

        const smoothedDx = Math.round(dx * 10) / 10
        const smoothedDy = Math.round(dy * 10) / 10

        if (Math.abs(smoothedDx) > 0.1 || Math.abs(smoothedDy) > 0.1) {
          socket.emit("mouse-move", {
            dx: smoothedDx,
            dy: smoothedDy,
          })
        }

        lastPosition.current = { x: currentX, y: currentY }
      }
    },
    onPanResponderRelease: (evt) => {
      // Skip tap detection if this was a multi-finger gesture
      if (evt.nativeEvent.touches.length > 0) return

      isFirstMove.current = true

      // Handle tap detection (only if no movement occurred and single finger)
      if (!hasMoved.current && socket && isConnected) {
        const now = Date.now()
        const timeSinceLastTap = now - lastTapTime.current

        // Check for double-tap (within 300ms)
        if (timeSinceLastTap < 300) {
          // Double-tap detected - send double-click
          if (tapTimeout.current) {
            clearTimeout(tapTimeout.current)
            tapTimeout.current = null
          }
          socket.emit("mouse-double-click")
          lastTapTime.current = 0 // Reset to prevent triple-tap
        } else {
          // Single tap - wait to see if there's a second tap
          lastTapTime.current = now
          tapTimeout.current = setTimeout(() => {
            // Single tap confirmed - send left click
            if (socket && isConnected) {
              socket.emit("mouse-click", "left")
            }
            tapTimeout.current = null
          }, 300)
        }
      }
    },
  })

  // Enhanced scroll gesture handler
  const scrollResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gestureState) => {
      if (socket && isConnected && Math.abs(gestureState.dy) > 15) {
        const scrollDirection = gestureState.dy > 0 ? "down" : "up"
        const scrollIntensity = Math.min(Math.abs(gestureState.dy) / 20, 5)

        socket.emit("mouse-scroll", {
          direction: scrollDirection,
          delta: scrollIntensity,
        })
      }
    },
  })

  // Handle mouse clicks with animation (NO VIBRATION)
  const handleClick = (button: "left" | "right" | "middle") => {
    if (socket && isConnected) {
      Animated.sequence([
        Animated.timing(buttonPressAnimation, {
          toValue: 0.95,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(buttonPressAnimation, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start()

      socket.emit("mouse-click", button)
    }
  }

  const ConnectionStatus = () => (
    <Animated.View
      style={[
        styles.statusContainer,
        {
          backgroundColor: connectionAnimation.interpolate({
            inputRange: [0, 1],
            outputRange: ["#ff6b6b", "#51cf66"],
          }),
        },
      ]}
    >
      <Ionicons name={isConnected ? "wifi" : "wifi-outline"} size={20} color="white" />
      <Text style={styles.statusText}>
        {isConnecting ? "Connecting..." : isConnected ? `Connected to ${serverIP}` : "Disconnected"}
      </Text>
    </Animated.View>
  )

  return (
    <LinearGradient colors={["#667eea", "#764ba2"]} style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Remote Mouse</Text>
        <TouchableOpacity onPress={() => setShowSettings(!showSettings)} style={styles.settingsButton}>
          <Ionicons name="settings-outline" size={24} color="white" />
        </TouchableOpacity>
      </View>

      <ConnectionStatus />

      {/* Settings Panel */}
      {showSettings && (
        <View style={styles.settingsPanel}>
          <Text style={styles.settingsTitle}>Settings</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Server IP: {serverIP}</Text>
            <Text style={styles.subLabel}>Auto-detected from development server</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Sensitivity: {sensitivity.toFixed(1)}x</Text>
            <View style={styles.sensitivityContainer}>
              {[0.5, 1.0, 1.5, 2.0, 3.0].map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.sensitivityButton, sensitivity === value && styles.sensitivityButtonActive]}
                  onPress={() => setSensitivity(value)}
                >
                  <Text style={[styles.sensitivityText, sensitivity === value && styles.sensitivityTextActive]}>
                    {value}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.toggleRow}>
              <Text style={styles.label}>Shake to Wake/Sleep</Text>
              <TouchableOpacity
                style={[styles.toggle, shakeEnabled && styles.toggleActive]}
                onPress={() => setShakeEnabled(!shakeEnabled)}
              >
                <Animated.View
                  style={[
                    styles.toggleIndicator,
                    {
                      transform: [
                        {
                          translateX: shakeEnabled ? 20 : 2,
                        },
                      ],
                    },
                  ]}
                />
              </TouchableOpacity>
            </View>
            <Text style={styles.subLabel}>Shake phone to toggle screen power</Text>
          </View>

          <View style={styles.connectionButtons}>
            <TouchableOpacity
              style={[styles.connectButton, isConnected && styles.disconnectButton]}
              onPress={isConnected ? disconnect : connectToServer}
              disabled={isConnecting}
            >
              <Ionicons name={isConnected ? "close-circle" : "play-circle"} size={20} color="white" />
              <Text style={styles.connectButtonText}>
                {isConnecting ? "Connecting..." : isConnected ? "Disconnect" : "Reconnect"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Mouse Pad Area - FIXED: Only one PanResponder */}
      <View style={styles.mousePadContainer}>
        <Text style={styles.mousePadLabel}>Trackpad</Text>
        <View style={styles.mousePad} {...panResponder.panHandlers}>
          <View style={styles.mousePadIndicator}>
            <Ionicons name="finger-print" size={40} color="#ffffff40" />
            <Text style={styles.mousePadText}>
              Tap to click • Double-tap to double-click{"\n"}Two fingers to right-click
            </Text>
          </View>
        </View>
      </View>

      {/* Scroll Area */}
      <View style={styles.scrollContainer}>
        <Text style={styles.scrollLabel}>Scroll Zone</Text>
        <View style={styles.scrollArea} {...scrollResponder.panHandlers}>
          <Ionicons name="swap-vertical" size={24} color="#ffffff60" />
          <Text style={styles.scrollText}>Swipe to scroll</Text>
        </View>
      </View>

      {/* Creative Features Info */}
      <View style={styles.featuresContainer}>
        <Text style={styles.featuresText}>
          🎯 Tap trackpad to click • 🖱️ Double-tap for double-click • 👆 Two fingers for right-click •{" "}
          {shakeEnabled ? "📳 Shake to wake/sleep" : "📳 Shake disabled"}
        </Text>
      </View>

      {/* Mouse Buttons */}
      <Animated.View style={[styles.buttonContainer, { transform: [{ scale: buttonPressAnimation }] }]}>
        <TouchableOpacity
          style={[styles.button, styles.leftButton]}
          onPress={() => handleClick("left")}
          disabled={!isConnected}
        >
          <Ionicons name="hand-left" size={20} color="white" />
          <Text style={styles.buttonText}>Left</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.middleButton]}
          onPress={() => handleClick("middle")}
          disabled={!isConnected}
        >
          <Ionicons name="ellipse" size={16} color="white" />
          <Text style={styles.buttonText}>Middle</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.rightButton]}
          onPress={() => handleClick("right")}
          disabled={!isConnected}
        >
          <Ionicons name="hand-right" size={20} color="white" />
          <Text style={styles.buttonText}>Right</Text>
        </TouchableOpacity>
      </Animated.View>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 50,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "white",
  },
  settingsButton: {
    padding: 8,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    marginBottom: 20,
  },
  statusText: {
    color: "white",
    fontWeight: "600",
    marginLeft: 8,
    fontSize: 14,
  },
  settingsPanel: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginHorizontal: 20,
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
    marginBottom: 15,
  },
  inputGroup: {
    marginBottom: 15,
  },
  label: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  subLabel: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 12,
    marginBottom: 8,
  },
  sensitivityContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sensitivityButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    width: 45,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  sensitivityButtonActive: {
    backgroundColor: "rgba(255, 255, 255, 0.4)",
  },
  sensitivityText: {
    color: "white",
    fontWeight: "600",
    fontSize: 12,
  },
  sensitivityTextActive: {
    color: "white",
    fontWeight: "bold",
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    padding: 2,
  },
  toggleActive: {
    backgroundColor: "rgba(81, 207, 102, 0.8)",
  },
  toggleIndicator: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "white",
  },
  connectionButtons: {
    marginTop: 10,
  },
  connectButton: {
    backgroundColor: "#51cf66",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 10,
  },
  disconnectButton: {
    backgroundColor: "#ff6b6b",
  },
  connectButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
    marginLeft: 8,
  },
  mousePadContainer: {
    flex: 1,
    marginHorizontal: 20,
    marginBottom: 15,
  },
  mousePadLabel: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
    textAlign: "center",
  },
  mousePad: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  mousePadIndicator: {
    alignItems: "center",
  },
  mousePadText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 12,
    marginTop: 10,
    textAlign: "center",
    lineHeight: 16,
  },
  scrollContainer: {
    marginHorizontal: 20,
    marginBottom: 15,
  },
  scrollLabel: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  scrollArea: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    height: 60,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  scrollText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 12,
    marginLeft: 8,
  },
  featuresContainer: {
    marginHorizontal: 20,
    marginBottom: 15,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 10,
    padding: 12,
  },
  featuresText: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 14,
  },
  buttonContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingBottom: 30,
    gap: 10,
  },
  button: {
    flex: 1,
    paddingVertical: 20,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  leftButton: {
    backgroundColor: "#4c6ef5",
  },
  middleButton: {
    backgroundColor: "#7c3aed",
  },
  rightButton: {
    backgroundColor: "#f59e0b",
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 14,
    marginTop: 5,
  },
})
