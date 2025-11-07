import React, { useEffect, useRef } from "react";
import {
  Image,
  ImageBackground,
  StyleSheet,
  Text,
  View,
  Animated,
  Dimensions,
  PanResponder,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "../navigation/AppNavigator";

type SplashScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "Splash">;

export default function SplashScreen() {
  const navigation = useNavigation<SplashScreenNavigationProp>();
  const pan = useRef(new Animated.ValueXY()).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const screenWidth = Dimensions.get('window').width;
    const sliderWidth = 200 - 46; // Track width minus thumb width

  useEffect(() => {
    // Gentle pulsing animation for the thumb
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: false,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: false,
        }),
      ])
    );
    pulseAnimation.start();

    return () => pulseAnimation.stop();
  }, [slideAnim]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // No offset needed for simple horizontal drag
      },
      onPanResponderMove: (evt, gesture) => {
        // Constrain the movement within the track bounds
        const newX = Math.max(0, Math.min(gesture.dx, sliderWidth));
        pan.setValue({ x: newX, y: 0 });
      },
      onPanResponderRelease: (e, gesture) => {
        // If swiped far enough to the right, navigate
        if (gesture.dx > sliderWidth * 0.7) {
          Animated.spring(pan, {
            toValue: { x: sliderWidth, y: 0 },
            useNativeDriver: false,
          }).start(() => {
            navigation.navigate("UserType");
          });
        } else {
          // Snap back to start
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  const trackColor = pan.x.interpolate({
    inputRange: [0, sliderWidth],
    outputRange: ['rgba(255, 255, 255, 0.2)', '#FFD700'],
    extrapolate: 'clamp',
  });

  const thumbColor = pan.x.interpolate({
    inputRange: [0, sliderWidth * 0.7, sliderWidth],
    outputRange: ['#FFD700', '#FFD700', '#021a3f'],
    extrapolate: 'clamp',
  });

  const iconColor = pan.x.interpolate({
    inputRange: [0, sliderWidth * 0.7, sliderWidth],
    outputRange: ['#021a3f', '#021a3f', '#FFD700'],
    extrapolate: 'clamp',
  });

  const arrowScale = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.1],
  });

  return (
    <ImageBackground
      source={require("../../assets/images/bg_img.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.container}>
        {/* Logo */}
        <Image
          source={require("../../assets/images/safe_logo.png")}
          style={styles.logo}
        />

        {/* Title */}
        <Text style={styles.title}>
          Citizen<Text style={styles.highlight}>Safe</Text>
        </Text>

        {/* Slogan Bar */}
        <View style={styles.taglineBox}>
          <Text style={styles.tagline}>
            your safety, our <Text style={styles.highlight}>priority</Text>
          </Text>
        </View>

        {/* Toggle Switch */}
        <View style={styles.toggleContainer}>
          <Text style={styles.toggleLabel}>Ready to get started?</Text>
          <View style={styles.toggleSwitch}>
            <Animated.View style={[styles.toggleTrack, { backgroundColor: trackColor }]}>
              <Animated.View
                style={[
                  styles.toggleThumb,
                  {
                    backgroundColor: thumbColor,
                    transform: [
                      { translateX: pan.x },
                      { scale: arrowScale },
                    ],
                  },
                ]}
                {...panResponder.panHandlers}
              >
                <Animated.Text style={[styles.toggleIcon, { color: iconColor }]}>▶</Animated.Text>
              </Animated.View>
            </Animated.View>
            <Text style={styles.toggleText}>Slide to continue</Text>
          </View>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "rgba(15, 51, 124, 0)",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 300,
    height: 300,
    marginTop: 40,
    marginBottom: 30,
    resizeMode: "contain",
  },
  title: {
    fontSize: 60,
    fontFamily: "Raleway-Bold",
    color: "#fff",
    marginBottom: 10,
  },
  highlight: {
    color: "#FFD700",
  },
  taglineBox: {
    width: "100%",
    backgroundColor: "#145b97",
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 20,
    marginBottom: 70,
  },
  tagline: {
    fontSize: 18,
    color: "#fff",
    textAlign: "center",
    fontFamily: "JosefinSans-Medium",
  },
  toggleContainer: {
    alignItems: "center",
    marginTop: 30,
  },
  toggleLabel: {
    fontSize: 18,
    color: "#fff",
    fontFamily: "JosefinSans-Medium",
    marginBottom: 20,
    textAlign: "center",
  },
  toggleSwitch: {
    alignItems: "center",
  },
  toggleTrack: {
    width: 200,
    height: 50,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 25,
    borderWidth: 2,
    borderColor: "#FFD700",
    position: "relative",
    justifyContent: "center",
  },
  toggleThumb: {
    position: "absolute",
    left: 0,
    width: 46,
    height: 46,
    backgroundColor: "#FFD700",
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  toggleIcon: {
    fontSize: 16,
    color: "#021a3f",
    fontWeight: "bold",
  },
  toggleText: {
    marginTop: 15,
    fontSize: 14,
    color: "#FFD700",
    fontFamily: "JosefinSans-Medium",
    textAlign: "center",
  },
});