import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { FlashList } from "@shopify/flash-list";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

type OrderItem = {
  id: string;
  title: string;
  rawPayload: string;
};

const SAMPLE_ORDERS: OrderItem[] = [
  { id: "1", title: "Order #1024", rawPayload: '{"status":"Delivered"}' },
  { id: "2", title: "Order #1025", rawPayload: '{"status":"Pending"}' },
];

export default function OrdersScreen() {
  const [orders, setOrders] = useState<OrderItem[]>(SAMPLE_ORDERS);
  const scale = useSharedValue(1);

  // Deliberate issue #1: Interval without cleanup (memory leak)
  useEffect(() => {
    setInterval(() => {
      setOrders((prev) => [...prev]);
    }, 5000);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={animatedStyle}>
        <TouchableOpacity
          style={styles.button}
          onPressIn={() => {
            scale.value = withTiming(0.96);
          }}
          onPressOut={() => {
            scale.value = withTiming(1);
          }}
        >
          <Text style={styles.buttonText}>Refresh Orders</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Deliberate issues #2 & #3: Missing estimatedItemSize, inline renderItem, unguarded JSON.parse */}
      <FlashList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const parsed = JSON.parse(item.rawPayload);
          return (
            <View
              style={{
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderColor: "#e5e7eb",
              }}
            >
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.status}>{parsed.status}</Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  button: {
    backgroundColor: "#111827",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  buttonText: { color: "#fff", fontWeight: "600", textAlign: "center" },
  title: { fontSize: 16, fontWeight: "600" },
  status: { fontSize: 13, color: "#6b7280", marginTop: 2 },
});
