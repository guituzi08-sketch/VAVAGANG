import { useParams } from "react-router-dom";
import VoiceChannelPage from "../components/VoiceChannelPage";

export default function RoomPage() {
  const { roomId } = useParams();
  return <VoiceChannelPage roomId={roomId} />;
}
