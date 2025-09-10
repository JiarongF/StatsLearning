import React from "react";

function PostRGuess({ parameters }: { parameters: { imagePath: string } }) {
  return (
    <div style={{ textAlign: "center" }}>
      <p style={{ marginLeft: "-10px", marginBottom: "12px", fontWeight: "500", fontSize: "20px"}}>
        Please guess the correlation of the graph.
      </p>
      <img
        src={parameters.imagePath}
        alt="Correlation stimulus"
        style={{
          width: "450px",       // fixed display width
          height: "450px",      // fixed display height
          objectFit: "contain"// keeps aspect ratio, fits inside box
        }}
      />
    </div>
  );
}

export default PostRGuess;
