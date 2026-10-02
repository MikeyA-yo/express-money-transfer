import { Html, Tailwind, Body, Text, Container, Heading } from "react-email";

export function EmailNotification({ subject, message }) {
  return (
  <Html>
    <Tailwind>
      <Body>
        <Container className="bg-gray-100 p-6">
        <Container className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden md:max-w-2xl">
          <Container className="p-6">
            <Heading className="text-2xl font-bold text-gray-800">{subject}</Heading>
            <Text className="text-gray-600 mt-2">{message}</Text>
          </Container>
        </Container>
      </Container>
      </Body>
    </Tailwind>
  </Html>
  );
}
