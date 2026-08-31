import { useRoute } from "./lib/router";
import { HomeScreen } from "./screens/HomeScreen";
import { MockScreen } from "./screens/MockScreen";
import { RoomScreen } from "./screens/RoomScreen";
import { TutorialScreen } from "./screens/TutorialScreen";

export function App() {
  const route = useRoute();
  if (route.name === "mock") return <MockScreen />;
  if (route.name === "tutorial") return <TutorialScreen />;
  if (route.name === "room") return <RoomScreen key={route.code} code={route.code} />;
  return <HomeScreen />;
}
