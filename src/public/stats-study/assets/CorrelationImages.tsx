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
      <Text size="md" ta="left" maw={650} style={{marginLeft: 200, marginBottom: 10}}>
  
These plots are shown for practice — they are not from real data, but are generated to illustrate 
a range of correlations. <br /><br />
Take your time to observe how the points are arranged, and notice how the strength and direction 
of the relationship changes across the graphs.<br /><br />
Please study the scatterplots and their different correlation values for <strong>at least 1 minute</strong>. <br/><br/>
After one minute, you will be able to click the next button and advance.<br/><br/>
🎙️ Please remember to think-aloud as you explore the tutorial!
</Text>
      <SimpleGrid cols={3} spacing="md">
        {images.map((src, idx) => (
          <Card key={rValues[idx]} shadow="sm" padding="sm" radius="md" withBorder>
            <Card.Section>
              <Image src={src} alt={`Scatterplot r = ${rValues[idx]}`} fit="contain" height={180} />
            </Card.Section>
            <Text ta="center" size="sm" mt="sm">
              correlation = {rValues[idx].toFixed(1)}
            </Text>
          </Card>
        ))}
      </SimpleGrid>
    </div>
  );
}
