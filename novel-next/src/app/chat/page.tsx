import { ChatProvider } from '@/lib/store/ChatProvider';
import { ChatScreen } from '@/components/screens/chat/ChatScreen';

export default function Page() {
  return (
    <ChatProvider>
      <ChatScreen />
    </ChatProvider>
  );
}
