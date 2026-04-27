import { Module } from "../../common/di"
import { MarketService } from "./market.service"

@Module({
  providers: [MarketService],
  exports: [MarketService],
})
export class MarketModule {}

export { MarketService } from "./market.service"
