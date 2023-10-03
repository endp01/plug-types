import { TypedDataField } from 'ethers'

import { mkdir } from 'node:fs'

import { types } from '../lib/constants'

type Types = Record<string, Array<TypedDataField>>
type Typename<TTypes extends Types = Types> = keyof TTypes extends string
	? keyof TTypes
	: never

const LICENSE = `// SPDX-License-Identifier: BUSL-1.1\n`
const VERSION = `pragma solidity ^0.8.19;\n`
const HEADER = `/**
 * @title Framework:ITypes
 * @notice The base EIP-712 types that power a modern intent framework.
 * @dev This file was auto-generated by @nftchance/emporium-types/cli.
 *      (https://github.com/nftchance/emporium-types)
 * @dev This interface and the consuming abstract are auto-generated by
 *      types declared in the framework configuration. As an extensible
 *      base, all projects build on top of Delegations and Invocations.
 * @author @nftchance
 * @author @danfinlay (https://github.com/delegatable/delegatable-sol)
 */`
const INTERFACE = `interface ITypes {`
const CONTRACT = `}

/**
 * @title Framework:Types 
 * @dev This file was auto-generated by @nftchance/emporium-types/cli.
 *      (https://github.com/nftchance/emporium-types)
 * @dev This abstract contract is auto-generated and should not be edited directly
 *      however it should be directly inherited from in the consuming protocol.
 * @author @nftchance
 * @author @danfinlay (https://github.com/delegatable/delegatable-sol)
 */
abstract contract Types is ITypes {`

export function getPacketHashGetterName(typeName: Typename) {
	if (typeName.includes('[]')) {
		return `GET_${typeName
			.substr(0, typeName.length - 2)
			.toUpperCase()}_ARRAY_PACKETHASH`
	}

	return `GET_${typeName.toUpperCase()}_PACKETHASH`
}

export function getEncodedValueFor(field: TypedDataField) {
	// * Basic types.
	if (
		[
			'address',
			'bool',
			'bytes32',
			'int',
			'uint',
			'uint256',
			'string'
		].includes(field.type)
	) {
		return `$input.${field.name}`
	}

	// * Hashed types.
	if (['bytes'].includes(field.type)) {
		return `keccak256($input.${field.name})`
	}

	// * Array and object types (ie: nested values.)
	return `${getPacketHashGetterName(field.type)}($input.${field.name})`
}

export function getPacketHashGetters<
	TTypes extends Types,
	TTypename extends Typename<TTypes>
>(
	typeName: TTypename,
	fields: TTypes[TTypename],
	packetHashGetters: Array<string> = []
) {
	if (typeName.includes('[]')) {
		packetHashGetters.push(getArrayPacketHashGetter(typeName))
	} else {
		packetHashGetters.push(`\t/**
    * @notice ${getPacketHashGetterName(
		typeName
	)}() is auto-generated and should not be edited.
    * @dev This function is used to encode ${typeName} data into a packet hash and
    *      decode ${typeName} data from a packet hash.
    * @param $input The ${typeName} data to encode.
    * @return $hash The packet hash of the encoded ${typeName} data.
    */
    function ${getPacketHashGetterName(typeName)} (
        ${typeName} memory $input
    ) 
        public 
        pure 
        returns (bytes32 $hash) 
    {
        $hash = keccak256(abi.encode(
            ${typeName.toUpperCase()}_TYPEHASH,
            ${fields.map(getEncodedValueFor).join(',\n\t\t\t')}
        ));
    }\n`)
	}

	fields.forEach(field => {
		if (field.type.includes('[]')) {
			packetHashGetters.push(getArrayPacketHashGetter(field.type))
		}
	})

	return packetHashGetters
}

export const getArrayPacketHashGetter = (typeName: Typename) => `\t/**
    * @notice ${getPacketHashGetterName(
		typeName
	)}() is auto-generated and should not be edited.
    * @dev This function is used to encode ${typeName} data into a packet hash and
    *      decode ${typeName} data from a packet hash.
    * @param $input The ${typeName} data to encode. 
    * @return $hash The packet hash of the encoded ${typeName} data.
    */
    function ${getPacketHashGetterName(typeName)} (
        ${typeName} memory $input
    ) 
        public 
        pure 
        returns (bytes32 $hash) 
    {
        bytes memory encoded;

        uint256 i;
        uint256 length = $input.length;

        for (i; i < length;) {
            encoded = bytes.concat(
                encoded,
                ${getPacketHashGetterName(
					typeName.substr(0, typeName.length - 2)
				)}($input[i])
            );

            unchecked { i++; }
        }
        
        $hash = keccak256(encoded);
    }`

export function getSolidity(types: Record<string, Array<TypedDataField>>) {
	const results: { struct: string; typeHash: string }[] = []
	const packetHashGetters: string[] = []

	Object.keys(types).forEach(typeName => {
		// * Determine the name of the type hash constant.
		const typeHashName = `${typeName.toUpperCase()}_TYPEHASH`

		// * Generate the basic solidity code for the type hash.
		// ! Really, there is no reason to use the human readable version if we can just encode it.
		const typeHash = `\tbytes32 constant ${typeHashName} = keccak256('');\n`

		// const typeHash = `bytes32 constant ${typeHashName} = keccak256("${encodeType(
		// 	typeName,
		// 	types.types
		// )}");\n`

		packetHashGetters.push(
			...getPacketHashGetters(
				typeName,
				types[typeName],
				packetHashGetters
			)
		)

		results.push({
			struct: `\t/**
     * @notice The ${typeName} struct is auto-generated and should not be edited.
     * @dev This struct is used to encode ${typeName} data into a packet hash and
     *      decode ${typeName} data from a packet hash.
     * 
     * Delegation extends EIP712<{ 
     *    ${types[typeName]
			.map(field => {
				return `{ name: '${field.name}', type: '${field.type}' }`
			})
			.join('\n\t *    ')}
     * }>
     */
    struct ${typeName} {\n${types[typeName]
		.map(field => {
			return `\t\t${field.type} ${field.name};\n`
		})
		.join('')}\t}`,
			typeHash
		})
	})

	console.log(
		`have generated ${packetHashGetters.length} packet hash getters`
	)

	const uniqueGetters = [...new Set(packetHashGetters)]

	console.log(`or uniquely, just ${uniqueGetters.length}`, uniqueGetters)

	return {
		setup: results,
		packetHashGetters: [...new Set(packetHashGetters)]
	}
}

export async function generate(filename: string) {
	const { setup, packetHashGetters } = getSolidity(
		types.types as unknown as Types
	)

	const lines: string[] = [LICENSE, VERSION, HEADER, INTERFACE]

	const structs: string[] = []
	const typeHashes: string[] = []

	setup.forEach(type => {
		structs.push(type.struct)
		typeHashes.push(type.typeHash)
	})

	lines.push(structs.join('\n\n'))

	lines.push(CONTRACT)

	lines.push(typeHashes.join('\n'))

	lines.push(packetHashGetters.join('\n'))

	mkdir(
		filename.split('/').slice(0, -1).join('/'),
		{ recursive: true },
		error => {
			if (error) {
				throw error
			}
		}
	)

	lines.push('}')

	await Bun.write(Bun.file(filename), lines.join('\n'))
}
