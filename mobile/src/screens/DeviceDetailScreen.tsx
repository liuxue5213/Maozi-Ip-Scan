import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Linking
} from 'react-native'
import {
  Button,
  Card,
  Divider,
  IconButton,
  List,
  Chip
} from 'react-native-paper'
import { useRoute, RouteProp } from '@react-navigation/native'

import { pingHost } from '../services/scanner'
import { lookupVendor } from '../services/network'
import type { RootStackParamList } from '../../App'

type DeviceDetailRouteProp = RouteProp<RootStackParamList, 'DeviceDetail'>

export default function DeviceDetailScreen() {
  const route = useRoute<DeviceDetailRouteProp>()
  const { device } = route.params
  const [pinging, setPinging] = useState(false)

  const handlePing = async () => {
    setPinging(true)
    const online = await pingHost(device.ip)
    setPinging(false)
    Alert.alert(
      'Ping 结果',
      online ? `${device.ip} 可达 ✅` : `${device.ip} 不可达 ❌`
    )
  }

  const openHTTP = (ip: string) => {
    Linking.openURL(`http://${ip}`).catch(() => {
      Alert.alert('错误', '无法打开浏览器')
    })
  }

  const openHTTPS = (ip: string) => {
    Linking.openURL(`https://${ip}`).catch(() => {
      Alert.alert('错误', '无法打开浏览器')
    })
  }

  return (
    <ScrollView style={styles.container}>
      {/* 基本信息 */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.ipTitle}>{device.ip}</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.label}>MAC 地址</Text>
            <Text style={styles.value}>
              {device.mac || 'N/A'}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.label}>厂商</Text>
            <Text style={styles.value}>
              {device.vendor || lookupVendor(device.mac) || '未知'}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.label}>主机名</Text>
            <Text style={styles.value}>{device.hostname || 'N/A'}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.label}>发现方式</Text>
            <Chip mode="outlined" compact>{device.source}</Chip>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.label}>状态</Text>
            <Chip
              mode="flat"
              compact
              style={[
                styles.statusChip,
                device.status === 'online' && styles.onlineChip
              ]}
            >
              {device.status === 'online' ? '在线' : '离线'}
            </Chip>
          </View>
        </Card.Content>
      </Card>

      {/* 开放端口 */}
      {device.openPorts && device.openPorts.length > 0 && (
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>开放端口 ({device.openPorts.length})</Text>
            <Divider style={styles.divider} />
            <View style={styles.portsGrid}>
              {device.openPorts.map((port: number) => (
                <Chip key={port} mode="outlined" style={styles.portChip}>
                  {port}
                </Chip>
              ))}
            </View>
          </Card.Content>
        </Card>
      )}

      {/* 快捷操作 */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>快捷操作</Text>
          <Divider style={styles.divider} />
          
          <View style={styles.actionsGrid}>
            <Button
              mode="contained"
              icon="wifi-find"
              onPress={handlePing}
              loading={pinging}
              style={styles.actionBtn}
            >
              Ping
            </Button>
            
            <Button
              mode="outlined"
              icon="web"
              onPress={() => openHTTP(device.ip)}
              style={styles.actionBtn}
            >
              HTTP
            </Button>
            
            <Button
              mode="outlined"
              icon="lock"
              onPress={() => openHTTPS(device.ip)}
              style={styles.actionBtn}
            >
              HTTPS
            </Button>
          </View>
        </Card.Content>
      </Card>

      {/* 开放端口 */}
      {device.openPorts && device.openPorts.length > 0 && (
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>开放端口</Text>
            <Divider style={styles.divider} />
            <View style={styles.portsGrid}>
              {device.openPorts.map((port: number) => (
                <Chip key={port} mode="outlined" style={styles.portChip}>
                  {port}
                </Chip>
              ))}
            </View>
          </Card.Content>
        </Card>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa'
  },
  card: {
    margin: 12,
    marginBottom: 8
  },
  ipTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#303133',
    fontFamily: 'monospace',
    marginBottom: 16
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8
  },
  label: {
    fontSize: 14,
    color: '#909399'
  },
  value: {
    fontSize: 14,
    color: '#303133',
    fontFamily: 'monospace'
  },
  statusChip: {
    backgroundColor: '#f4f4f5'
  },
  onlineChip: {
    backgroundColor: '#f0f9eb'
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8
  },
  divider: {
    marginBottom: 12
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  actionBtn: {
    flex: 1,
    minWidth: 100
  },
  portsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  portChip: {
    marginBottom: 4
  }
})
