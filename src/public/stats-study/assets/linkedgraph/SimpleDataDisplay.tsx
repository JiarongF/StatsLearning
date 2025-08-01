import { useState } from "react";
import {
  Box,
  Group,
  Text,
  ActionIcon,
  NumberInput,
  Paper,
  Stack,
  Badge,
  Flex,
} from "@mantine/core";
import { IconTrash, IconCheck, IconX, IconEdit } from "@tabler/icons-react";

interface DataItem {
  id: number;
  value: number;
}

interface DataDisplayProps {
  data: DataItem[];
  setData: (data: DataItem[]) => void;
  // New props for tracking edit state
  editingId: number | null;
  editValue: string | number;
  onStartEdit: (item: DataItem) => void;
  onEditValueChange: (value: string | number) => void;
  onSaveEdit: (id: number) => void;
  onCancelEdit: () => void;
}

export default function SimpleDataList({
  data,
  setData,
  editingId,
  editValue,
  onStartEdit,
  onEditValueChange,
  onSaveEdit,
  onCancelEdit,
}: DataDisplayProps) {
  const handleDelete = (id: number) => {
    setData(data.filter((item) => item.id !== id));
  };

  const handleEdit = (item: DataItem) => {
    onStartEdit(item);
  };

  const handleSave = (id: number) => {
    onSaveEdit(id);
  };

  const handleCancel = () => {
    onCancelEdit();
  };

  const handleEditValueChange = (value: string | number) => {
    onEditValueChange(value);
  };

  return (
    <Box>
      <Group mb="xs" justify="space-between">
        <Text size="sm" fw={500}>
          Data Points
        </Text>
        <Badge variant="light" size="sm">
          {data.length} values
        </Badge>
      </Group>

      <Stack gap="xs" style={{ maxHeight: 300, overflowY: "auto" }}>
        {data.map((item) => (
          <Paper key={item.id} p="xs" withBorder radius="sm">
            <Group justify="space-between" align="center">
              <Group gap="sm">
                <Text size="xs" c="dimmed" style={{ minWidth: 20 }}>
                  #{item.id}
                </Text>
                {editingId === item.id ? (
                  <NumberInput
                    size="xs"
                    style={{ width: 80 }}
                    value={editValue}
                    onChange={handleEditValueChange}
                    step={1}
                  />
                ) : (
                  <Text size="sm" fw={500}>
                    {item.value}
                  </Text>
                )}
              </Group>

              <Group gap={4}>
                {editingId === item.id ? (
                  <>
                    <ActionIcon
                      size="xs"
                      variant="filled"
                      color="green"
                      onClick={() => handleSave(item.id)}
                    >
                      <IconCheck size={12} />
                    </ActionIcon>
                    <ActionIcon
                      size="xs"
                      variant="filled"
                      color="red"
                      onClick={handleCancel}
                    >
                      <IconX size={12} />
                    </ActionIcon>
                  </>
                ) : (
                  <>
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="blue"
                      onClick={() => handleEdit(item)}
                    >
                      <IconEdit size={12} />
                    </ActionIcon>
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() => handleDelete(item.id)}
                    >
                      <IconTrash size={12} />
                    </ActionIcon>
                  </>
                )}
              </Group>
            </Group>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
