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
  TextInput,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
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

  // Keyboard states
  const [showKeyboard, setShowKeyboard] = useState(false)
  const [keyboardText, setKeyboardText] = useState("")

  // Volume states
  const [showVolumePanel, setShowVolumePanel] = useState(false)

  const connectionAnimation = useRef(new Animated.Value(0)).current
  const buttonPressAnimation = useRef(new Animated.Value(1)).current

  // Track previous position for more precise movement
  const lastPosition = useRef({ x: 0, y: 0 })
  const isFirstMove = useRef(true)

  // Tap detection for trackpad
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

  // Keyboard functions - reverted to original behavior
  const sendText = () => {
    if (socket && isConnected && keyboardText.trim()) {
      socket.emit("keyboard-type", { text: keyboardText })
      setKeyboardText("")
    }
  }

  // Handle Enter key press in TextInput
  const handleSubmitEditing = () => {
    sendText()
  }

  const sendSpecialKey = (key: string, modifiers: string[] = []) => {
    if (socket && isConnected) {
      socket.emit("keyboard-key", { key, modifiers })
    }
  }

  // Volume control functions
  const handleVolumeControl = (action: string, amount = 1) => {
    if (socket && isConnected) {
      socket.emit("volume-control", { action, amount })
    }
  }

  // Media control functions
  const handleMediaControl = (action: string) => {
    if (socket && isConnected) {
      socket.emit("media-control", { action })
    }
  }

  // Enhanced pan responder
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
      if (evt.nativeEvent.touches.length > 0) return

      isFirstMove.current = true

      if (!hasMoved.current && socket && isConnected) {
        const now = Date.now()
        const timeSinceLastTap = now - lastTapTime.current

        if (timeSinceLastTap < 300) {
          if (tapTimeout.current) {
            clearTimeout(tapTimeout.current)
            tapTimeout.current = null
          }
          socket.emit("mouse-double-click")
          lastTapTime.current = 0
        } else {
          lastTapTime.current = now
          tapTimeout.current = setTimeout(() => {
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

  // Handle mouse clicks with animation
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
            outputRange: ["#ef4444", "#10b981"],
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
    <LinearGradient colors={["#111827", "#1f2937", "#374151"]} style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Remote Mouse</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity onPress={() => setShowKeyboard(true)} style={styles.headerButton}>
            <Ionicons name="keypad-outline" size={20} color="#e5e7eb" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowVolumePanel(true)} style={styles.headerButton}>
            <Ionicons name="volume-high-outline" size={20} color="#e5e7eb" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowSettings(!showSettings)} style={styles.headerButton}>
            <Ionicons name="settings-outline" size={20} color="#e5e7eb" />
          </TouchableOpacity>
        </View>
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

      {/* Mouse Pad Area */}
      <View style={styles.mousePadContainer}>
        <Text style={styles.mousePadLabel}>Trackpad</Text>
        <View style={styles.mousePad} {...panResponder.panHandlers}>
          <View style={styles.mousePadIndicator}>
            <Ionicons name="finger-print" size={40} color="#6b7280" />
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
          <Ionicons name="swap-vertical" size={24} color="#9ca3af" />
          <Text style={styles.scrollText}>Swipe to scroll</Text>
        </View>
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

      {/* Keyboard Modal with KeyboardAvoidingView */}
      <Modal visible={showKeyboard} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 :0}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.keyboardModal, Platform.OS === 'android' && styles.androidKeyboardModal]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Virtual Keyboard</Text>
                <TouchableOpacity onPress={() => setShowKeyboard(false)}>
                  <Ionicons name="close" size={24} color="#e5e7eb" />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.keyboardInput}
                value={keyboardText}
                onChangeText={setKeyboardText}
                placeholder="Type here..."
                placeholderTextColor="#6b7280"
                multiline
                autoFocus
                returnKeyType="send"
                onSubmitEditing={handleSubmitEditing}
                blurOnSubmit={false}
              />

              <TouchableOpacity
                style={[styles.sendButton, !keyboardText.trim() && styles.sendButtonDisabled]}
                onPress={sendText}
                disabled={!keyboardText.trim()}
              >
                <Ionicons name="send" size={20} color="white" />
                <Text style={styles.sendButtonText}>Send Text</Text>
              </TouchableOpacity>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.specialKeysContainer}>
                <TouchableOpacity style={styles.specialKey} onPress={() => sendSpecialKey("enter")}>
                  <Text style={styles.specialKeyText}>Enter</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.specialKey} onPress={() => sendSpecialKey("backspace")}>
                  <Text style={styles.specialKeyText}>⌫</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.specialKey} onPress={() => sendSpecialKey("tab")}>
                  <Text style={styles.specialKeyText}>Tab</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.specialKey} onPress={() => sendSpecialKey("escape")}>
                  <Text style={styles.specialKeyText}>Esc</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.specialKey} onPress={() => sendSpecialKey("c", ["ctrl"])}>
                  <Text style={styles.specialKeyText}>Ctrl+C</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.specialKey} onPress={() => sendSpecialKey("v", ["ctrl"])}>
                  <Text style={styles.specialKeyText}>Ctrl+V</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.specialKey} onPress={() => sendSpecialKey("z", ["ctrl"])}>
                  <Text style={styles.specialKeyText}>Ctrl+Z</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Volume Modal */}
      <Modal visible={showVolumePanel} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.volumeModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Volume & Media Control</Text>
              <TouchableOpacity onPress={() => setShowVolumePanel(false)}>
                <Ionicons name="close" size={24} color="#e5e7eb" />
              </TouchableOpacity>
            </View>

            <View style={styles.volumeControls}>
              <Text style={styles.sectionTitle}>Volume</Text>
              <View style={styles.volumeButtons}>
                <TouchableOpacity style={styles.volumeButton} onPress={() => handleVolumeControl("down", 3)}>
                  <Ionicons name="volume-low" size={24} color="#e5e7eb" />
                  <Text style={styles.volumeButtonText}>Volume Down</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.volumeButton} onPress={() => handleVolumeControl("mute")}>
                  <Ionicons name="volume-mute" size={24} color="#e5e7eb" />
                  <Text style={styles.volumeButtonText}>Mute</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.volumeButton} onPress={() => handleVolumeControl("up", 3)}>
                  <Ionicons name="volume-high" size={24} color="#e5e7eb" />
                  <Text style={styles.volumeButtonText}>Volume Up</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.mediaControls}>
              <Text style={styles.sectionTitle}>Media Controls</Text>
              <View style={styles.mediaButtons}>
                <TouchableOpacity style={styles.mediaButton} onPress={() => handleMediaControl("previous")}>
                  <Ionicons name="play-skip-back" size={24} color="#e5e7eb" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.mediaButton} onPress={() => handleMediaControl("play-pause")}>
                  <Ionicons name="play" size={24} color="#e5e7eb" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.mediaButton} onPress={() => handleMediaControl("next")}>
                  <Ionicons name="play-skip-forward" size={24} color="#e5e7eb" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
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
    color: "#f9fafb",
  },
  headerButtons: {
    flexDirection: "row",
    gap: 10,
  },
  headerButton: {
    padding: 8,
    backgroundColor: "#374151",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#4b5563",
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
    backgroundColor: "#1f2937",
    marginHorizontal: 20,
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#374151",
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#f9fafb",
    marginBottom: 15,
  },
  inputGroup: {
    marginBottom: 15,
  },
  label: {
    color: "#e5e7eb",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  subLabel: {
    color: "#9ca3af",
    fontSize: 12,
    marginBottom: 8,
  },
  sensitivityContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sensitivityButton: {
    backgroundColor: "#374151",
    width: 45,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#4b5563",
  },
  sensitivityButtonActive: {
    backgroundColor: "#3b82f6",
    borderColor: "#2563eb",
  },
  sensitivityText: {
    color: "#e5e7eb",
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
    backgroundColor: "#374151",
    justifyContent: "center",
    padding: 2,
    borderWidth: 1,
    borderColor: "#4b5563",
  },
  toggleActive: {
    backgroundColor: "#10b981",
    borderColor: "#059669",
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
    backgroundColor: "#10b981",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 10,
  },
  disconnectButton: {
    backgroundColor: "#ef4444",
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
    color: "#e5e7eb",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
    textAlign: "center",
  },
  mousePad: {
    flex: 1,
    backgroundColor: "#1f2937",
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#374151",
  },
  mousePadIndicator: {
    alignItems: "center",
  },
  mousePadText: {
    color: "#9ca3af",
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
    color: "#e5e7eb",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  scrollArea: {
    backgroundColor: "#1f2937",
    height: 60,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#374151",
  },
  scrollText: {
    color: "#9ca3af",
    fontSize: 12,
    marginLeft: 8,
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
    backgroundColor: "#3b82f6",
  },
  middleButton: {
    backgroundColor: "#8b5cf6",
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
  keyboardAvoidingView: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  keyboardModal: {
    backgroundColor: "#1f2937",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "70%",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#374151",
  },
  volumeModal: {
    backgroundColor: "#1f2937",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "50%",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#374151",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#f9fafb",
  },
  keyboardInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e3a8a",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 15,
  },
  keyboardInfoText: {
    color: "#dbeafe",
    fontSize: 14,
    marginLeft: 8,
    fontWeight: "500",
  },
  keyboardInput: {
    backgroundColor: "#374151",
    borderRadius: 10,
    padding: 15,
    color: "#f9fafb",
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#4b5563",
  },
  sendButton: {
    backgroundColor: "#10b981",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  sendButtonDisabled: {
    backgroundColor: "#6b7280",
    opacity: 0.6,
  },
  sendButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
    marginLeft: 8,
  },
  specialKeysContainer: {
    flexDirection: "row",
  },
  specialKey: {
    backgroundColor: "#374151",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#4b5563",
  },
  
  specialKeyText: {
    color: "#e5e7eb",
    fontSize: 12,
    fontWeight: "600",
  },
  volumeControls: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f9fafb",
    marginBottom: 15,
    textAlign: "center",
  },
  volumeButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  volumeButton: {
    backgroundColor: "#374151",
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    flex: 1,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: "#4b5563",
  },
  volumeButtonText: {
    color: "#e5e7eb",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 5,
  },
  mediaControls: {
    marginBottom: 10,
  },
  mediaButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  mediaButton: {
    backgroundColor: "#374151",
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#4b5563",
  },

androidKeyboardModal: {
  marginBottom: 20, // Add some margin for Android
},
})
