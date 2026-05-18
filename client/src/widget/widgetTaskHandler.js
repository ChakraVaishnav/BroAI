import React from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { BroAIWidget } from './BroAIWidget';

export async function widgetTaskHandler(props) {
  const widgetInfo = props.widgetInfo;
  const widgetState = props.widgetState;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      requestWidgetUpdate({
        widgetName: 'BroAIWidget',
        renderWidget: () => <BroAIWidget />,
        widgetInfo,
      });
      break;

    case 'WIDGET_DELETED':
    case 'WIDGET_CLICK':
      break;
    
    default:
      break;
  }
}
