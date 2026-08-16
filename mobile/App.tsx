import React from 'react'
import { StatusBar } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Provider as PaperProvider } from 'react-native-paper'

import ScanScreen from './src/screens/ScanScreen'
import DeviceDetailScreen from './src/screens/DeviceDetailScreen'

export type RootStackParamList = {
  Scan: undefined
  DeviceDetail: { device: any }
}

const Stack = createNativeStackNavigator<RootStackParamList>()

const theme = {
  colors: {
    primary: '#667eea',
    accent: '#764ba2',
    background: '#f5f7fa',
    surface: '#ffffff',
    text: '#303133',
    onSurface: '#606266',
    notification: '#f56c6c'
  }
}

function App(): React.JSX.Element {
  return (
    <PaperProvider theme={theme}>
      <NavigationContainer>
        <StatusBar barStyle="light-content" backgroundColor="#667eea" />
        <Stack.Navigator
          initialRouteName="Scan"
          screenOptions={{
            headerStyle: {
              backgroundColor: '#667eea'
            },
            headerTintColor: '#ffffff',
            headerTitleStyle: {
              fontWeight: 'bold'
            }
          }}
        >
          <Stack.Screen
            name="Scan"
            component={ScanScreen}
            options={{ title: '🐱 Maozi-Ip-Scan' }}
          />
          <Stack.Screen
            name="DeviceDetail"
            component={DeviceDetailScreen}
            options={{ title: '设备详情' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  )
}

export default App
