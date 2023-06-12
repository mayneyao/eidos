import { getAllCodeBlocks } from "./markdown"

describe("getAllCodeBlocks", () => {
  // it("should return all code blocks", () => {
  //   const markdown = `
  //     # Hello World
  //     \`\`\`sql
  //     SELECT * FROM table;
  //     \`\`\`
  //     \`\`\`sql
  //     SELECT * FROM table;
  //     \`\`\`
  //   `
  //   const codeBlocks = getAllCodeBlocks(markdown)
  //   expect(codeBlocks).toHaveLength(2)
  //   codeBlocks?.forEach((codeBlock) => {
  //     expect(getSQLFromMarkdownCodeBlock(codeBlock)).toEqual(
  //       "SELECT * FROM table;"
  //     )
  //   })
  // })

  it("get code from markdown ", () => {
    const markdown =
      '```sql\nSELECT rating, COUNT(*) as count\nFROM movie_review\nGROUP BY rating\nORDER BY rating ASC;\n``` \n\n```js\nconst svg = d3.select("#chart").append("svg").attr("width", 500).attr("height", 500)\n\nconst margin = { top: 20, right: 20, bottom: 70, left: 40 }\nconst width = svg.attr("width") - margin.left - margin.right\nconst height = svg.attr("height") - margin.top - margin.bottom\n\nconst g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")")\n\nconst x = d3.scaleBand().range([0, width]).padding(0.4)\nconst y = d3.scaleLinear().range([height, 0])\n\nx.domain(_DATA_.map(d => d.rating))\ny.domain([0, d3.max(_DATA_, d => d.count)])\n\ng.append("g")\n  .attr("transform", "translate(0," + height + ")")\n  .call(d3.axisBottom(x))\n  .selectAll("text")\n  .attr("y", 0)\n  .attr("x", 9)\n  .attr("dy", ".35em")\n  .attr("transform", "rotate(90)")\n  .style("text-anchor", "start")\n\ng.append("g")\n  .call(d3.axisLeft(y).tickFormat(d => d))\n\ng.selectAll(".bar")\n  .data(_DATA_)\n  .enter().append("rect")\n  .attr("class", "bar")\n  .attr("x", d => x(d.rating))\n  .attr("y", d => y(d.count))\n  .attr("width", x.bandwidth())\n  .attr("height", d => height - y(d.count))\n```'
    const codeBlocks = getAllCodeBlocks(markdown)
    console.log(codeBlocks)
  })
})
