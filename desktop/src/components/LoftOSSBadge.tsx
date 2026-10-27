import { Link, Text, useColorModeValue, VStack } from "@chakra-ui/react"
import { client } from "../client"
import { DeepSeek, Loft } from "../icons"

export function LoftOSSBadge() {
  const textColor = useColorModeValue("gray.500", "gray.400")
  const deepSeekColor = useColorModeValue("#4D6BFE", "#7C8FFF")

  return (
    <VStack alignItems="start" spacing="2">
      <Link
        display="flex"
        alignItems="center"
        justifyContent="start"
        onClick={() => client.open("https://www.deepseek.com/")}>
        <DeepSeek boxSize="10" color={deepSeekColor} />
      </Link>
      <Link
        display="flex"
        alignItems="center"
        justifyContent="start"
        onClick={() => client.open("https://loft.sh/")}>
        <Text fontSize="sm" color={textColor} marginRight="2">
          Open sourced by
        </Text>
        <Loft width="10" height="6" />
      </Link>
    </VStack>
  )
}
