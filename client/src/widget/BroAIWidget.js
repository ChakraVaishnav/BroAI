import React from 'react';
import { FlexWidget, TextWidget, Action } from 'react-native-android-widget';

export function BroAIWidget() {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#111111',
        borderRadius: 20,
        padding: 16,
        justifyContent: 'space-between',
      }}
    >
      {/* Header / Quick Launch */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderColor: '#333333',
        }}
        clickAction={Action.openUrl('broai://new')}
      >
        <TextWidget
          text="BRO AI"
          style={{
            fontSize: 16,
            fontWeight: 'bold',
            color: '#FFFFFF',
            letterSpacing: 2,
          }}
        />
        <FlexWidget
          style={{
            backgroundColor: '#333333',
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 12,
          }}
        >
          <TextWidget text="+" style={{ color: '#FFFFFF', fontSize: 16 }} />
        </FlexWidget>
      </FlexWidget>

      {/* Quick Compose Box */}
      <FlexWidget
        style={{
          backgroundColor: '#222222',
          padding: 14,
          borderRadius: 16,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginVertical: 12,
        }}
        clickAction={Action.openUrl('broai://compose')}
      >
        <TextWidget
          text="Ask Sir Vaishnav something..."
          style={{
            color: '#888888',
            fontSize: 14,
          }}
        />
        <TextWidget text="▶" style={{ color: '#AAAAAA', fontSize: 14 }} />
      </FlexWidget>

      {/* Last Session */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#1a1a1a',
          padding: 12,
          borderRadius: 12,
        }}
        clickAction={Action.openUrl('broai://last')}
      >
        <TextWidget text="💬" style={{ fontSize: 14, marginRight: 8 }} />
        <TextWidget
          text="Resume last conversation..."
          style={{
            color: '#CCCCCC',
            fontSize: 13,
          }}
          maxLines={1}
          truncate="END"
        />
      </FlexWidget>
    </FlexWidget>
  );
}
