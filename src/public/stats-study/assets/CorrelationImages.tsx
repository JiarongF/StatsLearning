import React from "react";
import { SimpleGrid, Card, Image, Text } from "@mantine/core";

import img01 from "./control-images/0.1-correlation.png";
import img02 from "./control-images/0.2-correlation.png";
import img03 from "./control-images/0.3-correlation.png";
import img04 from "./control-images/0.4-correlation.png";
import img05 from "./control-images/0.5-correlation.png";
import img06 from "./control-images/0.6-correlation.png";
import img07 from "./control-images/0.7-correlation.png";
import img08 from "./control-images/0.8-correlation.png";
import img09 from "./control-images/0.9-correlation.png";

const images = [img01, img02, img03, img04, img05, img06, img07, img08, img09];
const rValues = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

export default function CorrelationImages() {
  return (
    <div style={{ width: "100%", padding: 16 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, textAlign: "center" }}>
        Positive Correlation
      </h2>
      <SimpleGrid cols={3} spacing="md">
        {images.map((src, idx) => (
          <Card key={rValues[idx]} shadow="sm" padding="sm" radius="md" withBorder>
            <Card.Section>
              <Image src={src} alt={`Scatterplot r = ${rValues[idx]}`} fit="contain" height={180} />
            </Card.Section>
            <Text ta="center" size="sm" mt="sm">
              r = {rValues[idx].toFixed(1)}
            </Text>
          </Card>
        ))}
      </SimpleGrid>
    </div>
  );
}
